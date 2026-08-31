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
  if (!row) throw new Error('서버가 저장 결과를 돌려주지 않았습니다.')
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
