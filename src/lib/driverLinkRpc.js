// @ts-check
// 슬라이스 A (보리 승인, 2026-08-31 / 2026-09-01 보완): 로그인 사용자의 기사 초대
// 저장을 mutation outbox / durable / 재시도 큐 없이 upsert_driver_link_idempotent
// RPC 1회로 끝낸다. 이 파일은 그 RPC 호출과, RPC no-op update로는 못 바꾸는 기존
// 서버 행의 필드 보정 update만 담는다. 기간 겹침 조회는 보리 지시로 제거했다
// (같은 차량번호 1명 규칙은 domain/drivers.js upsertDriver가 저장 전에 본다).
// requestDriverInviteSave.js가 유일한 호출부다.
/** @typedef {import('./outboxTypes.js').DriverLinkRow} DriverLinkRow */
import { supabase } from '../supabaseClient.js'
import { assertCloudWriteReady } from './cloudSession.js'
import { normalizeInviteCode } from '../domain/drivers.js'

/**
 * upsert_driver_link_idempotent RPC 1회. 같은 p_idempotency_key면 서버가 기존 행을
 * 그대로 돌려준다(멱등) — 응답만 유실됐던 성공을 재사용한다. 겹침 검사는 호출부가
 * 이 함수 *전에* 따로 한다.
 * @param {{ idempotencyKey: string, vehicleId: string, inviteCode: string,
 *   assignmentStart: string, assignmentEnd: string|null }} params
 * @returns {Promise<DriverLinkRow>}
 */
export async function upsertDriverLinkViaRpc({ idempotencyKey, vehicleId, inviteCode, assignmentStart, assignmentEnd }) {
  assertCloudWriteReady()
  const { data, error } = await supabase.rpc('upsert_driver_link_idempotent', {
    p_idempotency_key: idempotencyKey,
    p_vehicle_id: vehicleId,
    p_invite_code: inviteCode,
    p_assignment_start: assignmentStart,
    p_assignment_end: assignmentEnd || null,
  })
  if (error) throw error
  const row = /** @type {DriverLinkRow|undefined} */ (Array.isArray(data) ? data[0] : data)
  if (!row) throw new Error('저장이 끝났는지 확인하지 못했습니다. 화면을 새로고침해서 확인해 주세요.')
  return row
}

/**
 * 기존 서버 행의 기간/코드/차량을 직접 1회 update한다. RPC의 no-op update로는
 * 수정 필드가 반영되지 않는 구멍(로그인 수정, 또는 응답 유실 재시도 중 필드 변경)을
 * 메운다. insert 재시도 루프도, outbox도 쓰지 않는다.
 * @param {{ supabaseId: number|string, vehicleId: string, inviteCode: string,
 *   assignmentStart: string, assignmentEnd: string|null }} params
 * @returns {Promise<DriverLinkRow>}
 */
export async function updateDriverLinkFields({ supabaseId, vehicleId, inviteCode, assignmentStart, assignmentEnd }) {
  assertCloudWriteReady()
  const { data, error } = await supabase
    .from('driver_links')
    .update({
      vehicle_id: vehicleId,
      invite_code: inviteCode,
      assignment_start: assignmentStart,
      assignment_end: assignmentEnd || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supabaseId)
    .select()
    .single()
  if (error) throw error
  return /** @type {DriverLinkRow} */ (data)
}

/**
 * 서버 행이 원하는 기간/코드와 다른지 — 다르면 updateDriverLinkFields로 보정한다.
 * @param {DriverLinkRow} row
 * @param {{ inviteCode: string, assignmentStart: string, assignmentEnd: string|null }} want
 */
export function driverLinkRowNeedsUpdate(row, { inviteCode, assignmentStart, assignmentEnd }) {
  return (
    String(row.assignment_start ?? '') !== assignmentStart
    || String(row.assignment_end ?? '') !== (assignmentEnd ?? '')
    || (row.invite_code != null && row.invite_code !== inviteCode)
  )
}

/**
 * 기사가 초대코드로 스스로를 차주에 연결. Fail-Fast — durable 큐 없음.
 * @param {string} inviteCode
 * @returns {Promise<DriverLinkRow>}
 */
export async function redeemDriverInviteCode(inviteCode) {
  // hydrate ready를 요구하지 않는다 — 연동 전·hydrate 실패 상태에서도 초대코드로
  // 차주에 붙을 수 있어야 한다. auth만 확인(RPC도 auth.uid() 검사).
  const { data: authData, error: authError } = await supabase.auth.getSession()
  if (authError || !authData?.session?.user) {
    throw new Error('로그인이 필요합니다.')
  }
  const { data, error } = await supabase.rpc('redeem_driver_invite_code', {
    p_invite_code: normalizeInviteCode(inviteCode),
  })
  if (error) throw new Error(error.message || '초대 코드 연동에 실패했습니다.')
  const row = /** @type {DriverLinkRow|undefined} */ (Array.isArray(data) ? data[0] : data)
  // 0019: 틀리거나 만료된 코드는 실패 횟수를 남기려고 오류 대신 빈 결과로 온다.
  if (!row) throw new Error('초대 코드가 맞지 않거나 기한(7일)이 지났습니다. 차주에게 새 코드를 요청해 주세요.')
  return row
}

/**
 * 로그인 사용자가 이미 linked인 driver_links 행(자기 행만 — RLS). 확인 실패와 "연동 없음"을 구별한다
 * (로드맵 19: 실패를 "없음"으로 보면 기사가 차주 칸 대신 본인 칸으로 들어감).
 * @param {string} userId
 * @returns {Promise<{ ok: true, link: DriverLinkRow|null } | { ok: false }>}
 */
export async function checkLinkedDriverLink(userId) {
  if (!userId) return { ok: true, link: null }
  const { data, error } = await supabase
    .from('driver_links')
    .select('*')
    .eq('driver_id', userId)
    .eq('status', 'linked')
    .maybeSingle()
  if (error) {
    console.warn('[driverLinkRpc] linked 조회 실패', error)
    return { ok: false }
  }
  return { ok: true, link: data ? /** @type {DriverLinkRow} */ (data) : null }
}

/**
 * 위 확인의 예전 모양(실패도 null) — 앱이 켜진 뒤 사용처(연동 해제·초대코드·다시 불러오기)는 그대로 쓴다.
 * @param {string} userId
 * @returns {Promise<DriverLinkRow|null>}
 */
export async function fetchLinkedDriverLink(userId) {
  const result = await checkLinkedDriverLink(userId)
  return result.ok ? result.link : null
}

/** @returns {Promise<Array<{ id: string, number?: string, type?: string, tonnage?: string, driver_pay_mode?: string|null, driver_salary_amount?: number|string|null, comm_enabled?: boolean|null, comm_type?: string|null, comm_value?: string|null, insurance_on?: boolean|null, driver_income_type?: string|null, withholding_on?: boolean|null, expense_rate?: string|null, insurance_rate?: string|null }>>} */
export async function fetchAssignedVehicleSummary() {
  const { data, error } = await supabase.rpc('get_assigned_vehicle_summary')
  if (error) throw error
  return Array.isArray(data) ? data : []
}

/**
 * 연동 기사 앱 개인정보의 "사업자 정보·정산 계좌"에 보여 줄 차주 값(9-B-0, 0015 — 지금 연동 중인 기사 본인만 조회).
 * @param {string} ownerId
 * @returns {Promise<{ name?: string|null, business_name?: string|null, business_representative?: string|null, business_number?: string|null, business_address?: string|null, business_type?: string|null, business_item?: string|null, business_email?: string|null, bank_name?: string|null, account_number?: string|null, account_holder?: string|null }|null>}
 */
export async function fetchLinkedOwnerBusinessInfo(ownerId) {
  const { data, error } = await supabase.rpc('get_linked_owner_business_info', {
    p_owner_id: ownerId,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}
