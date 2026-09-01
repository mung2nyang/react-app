// @ts-check
// Step 0-4 감사 보완 4차(+재작업): cloudSync.js 분리 조각 — Supabase를 직접 호출하는 "실행기"
// 함수들. outboxFlush.js가 이 함수들을 재시도 대상으로 호출하고, 사용자가 즉시 시도할
// 때도 같은 함수를 쓴다(실행기가 하나뿐이라 "즉시 시도"와 "재시도"가 항상 같은 코드
// 경로를 탄다). 전부 삭제는 delete-of-already-deleted-row가 에러 없이 성공하는
// Supabase 기본 동작에 기대어 자연히 idempotent하다 — 중간에 실패한 테이블 뒤부터
// 다시 실행돼도 안전하다.
//
// 4차 재작업(사용자 지시 2번): 다단계 삭제/upsert의 모든 원격 await 직후
// assertSessionStillCurrent(captured)로 세션을 재검증한다 — 그 사이 로그아웃/owner
// 전환이 있었으면 `.staleSession` 표시가 된 에러를 던져 남은 단계를 실행하지 않는다.
// 모든 함수가 `captured`(cloudSession.captureSession()의 결과)를 필수로 받는다.
/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */
import { supabase } from '../supabaseClient.js'
import { assertCloudWriteReady, assertSessionStillCurrent, getCloudUserId } from './cloudSession.js'
import { rangesOverlap } from './cloudStorage.js'

/**
 * @param {number|string|null|undefined} vehicleSupabaseId
 * @param {SessionCapture} captured
 */
export async function deleteVehicleFromSupabase(vehicleSupabaseId, captured) {
  if (!vehicleSupabaseId) return
  assertCloudWriteReady()
  const childResults = await Promise.all([
    supabase.from('transport_details').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('maintenance_records').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('fuel_records').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('misc_expense_records').delete().eq('vehicle_id', vehicleSupabaseId),
  ])
  assertSessionStillCurrent(captured)
  const childError = childResults.find((result) => result.error)?.error
  if (childError) throw childError
  const { error: dailyLogsError } = await supabase.from('daily_logs').delete().eq('vehicle_id', vehicleSupabaseId)
  assertSessionStillCurrent(captured)
  if (dailyLogsError) throw dailyLogsError
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleSupabaseId)
  assertSessionStillCurrent(captured)
  if (error) throw error
}

/**
 * @param {number|string|null|undefined} clientSupabaseId
 * @param {SessionCapture} captured
 */
export async function deleteClientFromSupabase(clientSupabaseId, captured) {
  if (!clientSupabaseId) return
  assertCloudWriteReady()
  const unlinkResults = await Promise.all([
    supabase.from('transport_details').update({ client_id: null }).eq('client_id', clientSupabaseId),
    supabase.from('tax_invoices').update({ client_id: null }).eq('client_id', clientSupabaseId),
  ])
  assertSessionStillCurrent(captured)
  const unlinkError = unlinkResults.find((result) => result.error)?.error
  if (unlinkError) throw unlinkError
  const { error } = await supabase.from('clients').delete().eq('id', clientSupabaseId)
  assertSessionStillCurrent(captured)
  if (error) throw error
}

/**
 * @param {number|string} vehicleId
 * @param {string} start
 * @param {string} end
 * @param {number|string|null|undefined} excludeSupabaseId
 */
export async function findOverlappingDriverLinkOnSupabase(vehicleId, start, end, excludeSupabaseId) {
  assertCloudWriteReady()
  const { data, error } = await supabase
    .from('driver_links')
    .select('id, assignment_start, assignment_end, status, driver_id')
    .eq('vehicle_id', vehicleId)
    .neq('status', 'disconnected')
  if (error) throw error
  return (data || []).find((row) => {
    if (excludeSupabaseId && row.id === excludeSupabaseId) return false
    if (!row.assignment_start) return false
    return rangesOverlap(start, end || '', row.assignment_start, row.assignment_end || '')
  }) || null
}

/**
 * 사용자 지시 8번(4차 재작업에서 오류 처리 보강) — 신규 insert의 서버 응답이 유실된
 * 뒤 재시도해도 진짜로 수렴하게 하는 idempotency 조회. "같은 차량 + 같은 시작일 +
 * 같은 초대코드"로 이미 pending 행이 있으면, 그건 방금 응답만 못 받은 내 이전
 * 시도가 실제로는 성공했다는 뜻이다 — 다시 insert하는 대신 그 행을 그대로 쓴다.
 *
 * 4차 재작업 정정: 조회 자체가 실패하면(네트워크 등) "없다"로 삼키고 insert로
 * 넘어가면 안 된다 — 실제로는 있는데 조회만 실패한 경우 중복 insert로 이어질 수
 * 있다. 이제는 그대로 던져 retryable 실패로 처리되게 한다(outboxFlush.js가 이걸
 * outbox에 남겨 다음 flush가 다시 조회부터 시도하게 한다).
 *
 * 알려진 한계(마이그레이션 필요, 이번 라운드에서 적용하지 않음): 이 자연키(vehicle_id
 * + assignment_start + invite_code) 조회는 "응답 유실"과 "그 사이 invite_code가
 * 23505 충돌로 재발급됨"이 동시에 일어나면 같은 시도를 못 알아본다 — 재발급된
 * 코드는 이 outbox op의 payload에 없기 때문이다. 완전히 닫으려면 driver_links에
 * op.id 기반 불변 idempotency_key 컬럼 + 고유 제약(또는 그걸 쓰는 원자적 upsert
 * RPC)이 필요하다 — supabase/migrations/0001_driver_links_idempotency_key.sql 참고.
 * @param {number|string} vehicleId
 * @param {string} assignmentStart
 * @param {string} inviteCode
 */
export async function findExistingDriverLinkInsert(vehicleId, assignmentStart, inviteCode) {
  const { data, error } = await supabase
    .from('driver_links')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('assignment_start', assignmentStart)
    .eq('invite_code', inviteCode)
    .maybeSingle()
  if (error) throw error
  // .maybeSingle()은 원래 단일 행 또는 null만 돌려준다 — 배열이 오면(빈 배열 포함)
  // "찾았다"로 착각하면 안 된다. 빈 배열은 truthy라 `data || null`만으로는 못 거른다.
  if (!data || Array.isArray(data)) return null
  return data
}

/**
 * @param {{ supabaseId: number|string|null|undefined, vehicleId: number|string, inviteCode: string, assignmentStart: string, assignmentEnd: string|null|undefined }} params
 * @param {SessionCapture} captured
 */
export async function upsertDriverLinkOnSupabase({ supabaseId, vehicleId, inviteCode, assignmentStart, assignmentEnd }, captured) {
  assertCloudWriteReady()
  const baseRow = {
    owner_id: getCloudUserId(),
    vehicle_id: vehicleId,
    assignment_start: assignmentStart,
    assignment_end: assignmentEnd || null,
    updated_at: new Date().toISOString(),
  }
  if (supabaseId) {
    const { data, error } = await supabase.from('driver_links').update({ ...baseRow, invite_code: inviteCode }).eq('id', supabaseId).select().single()
    assertSessionStillCurrent(captured)
    if (error) throw error
    return data
  }

  const ownPrior = await findExistingDriverLinkInsert(vehicleId, assignmentStart, inviteCode)
  assertSessionStillCurrent(captured)
  if (ownPrior) return ownPrior

  let code = inviteCode
  /** @type {{ code?: string } | null} */
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase.from('driver_links').insert({ ...baseRow, invite_code: code, status: 'pending' }).select().single()
    assertSessionStillCurrent(captured)
    if (!error) return data
    if (error.code === '23505') {
      lastError = error
      code = String(Math.floor(100000 + Math.random() * 900000))
      continue
    }
    throw error
  }
  throw lastError || new Error('초대 코드 생성에 반복적으로 실패했습니다.')
}

/**
 * @param {number|string|null|undefined} supabaseId
 * @param {'pending'|'linked'} status
 * @param {SessionCapture} captured
 */
export async function updateDriverLinkStatusOnSupabase(supabaseId, status, captured) {
  if (!supabaseId) return
  assertCloudWriteReady()
  const { error } = await supabase.from('driver_links').update({ status, updated_at: new Date().toISOString() }).eq('id', supabaseId)
  assertSessionStillCurrent(captured)
  if (error) throw error
}

/**
 * 슬라이스 B 보완(2026-09-01): 0행 삭제(이미 없음/RLS로 안 보임)를 성공으로 치면
 * Store만 비고 서버 행이 남아 hydrate가 다시 그린다. .select()로 실제로 지워진 행을
 * 받아 0행이면 throw — 호출부가 Fail-Fast 토스트를 띄우고 로컬을 건드리지 않는다.
 * @param {number|string|null|undefined} supabaseId
 * @param {SessionCapture} captured
 */
export async function deleteDriverLinkOnSupabase(supabaseId, captured) {
  if (!supabaseId) return
  assertCloudWriteReady()
  const { data, error } = await supabase.from('driver_links').delete().eq('id', supabaseId).select('id')
  assertSessionStillCurrent(captured)
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('삭제할 기사 연동 행을 찾지 못했습니다.')
  }
}
