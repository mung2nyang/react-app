// @ts-check
// Supabase를 직접 부르는 실행기 함수. 즉시 시도와 outbox 재시도가 같은 함수를 쓴다. 삭제는 이미 없는 행 삭제도 성공이라 중간부터 다시 돌아도 안전하다.
// 모든 함수는 captured를 받아 원격 await마다 assertSessionStillCurrent로 세션을 재확인한다.
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
  // 본체 0행 삭제(이미 없음/RLS로 안 보임)를 성공으로 치면
  // Store만 비고 서버 행이 남아 hydrate가 다시 그린다 — 실제로 지운 행이 0이면
  // throw로 Fail-Fast. 자식 테이블 0행은 "이미 없음"이라 허용한다. (Supabase의
  // delete().select()는 항상 배열을 준다. 배열이 아니면 이 정보가 없는 것이라
  // 통과시킨다.)
  const { data, error } = await supabase.from('vehicles').delete().eq('id', vehicleSupabaseId).select('id')
  assertSessionStillCurrent(captured)
  if (error) throw error
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('이미 삭제됐거나 찾을 수 없습니다. 화면을 새로고침해 주세요.')
  }
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
  // 본체 0행 삭제는 성공이 아니다 — throw로 Fail-Fast(차량과 동일 계약).
  const { data, error } = await supabase.from('clients').delete().eq('id', clientSupabaseId).select('id')
  assertSessionStillCurrent(captured)
  if (error) throw error
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('이미 삭제됐거나 찾을 수 없습니다. 화면을 새로고침해 주세요.')
  }
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
 * 신규 insert의 서버 응답이 유실된
 * 뒤 재시도해도 진짜로 수렴하게 하는 idempotency 조회. "같은 차량 + 같은 시작일 +
 * 같은 초대코드"로 이미 pending 행이 있으면, 그건 방금 응답만 못 받은 내 이전
 * 시도가 실제로는 성공했다는 뜻이다 — 다시 insert하는 대신 그 행을 그대로 쓴다.
 *
 * 조회 자체가 실패하면(네트워크 등) "없다"로 삼키고 insert로
 * 넘어가면 안 된다 — 실제로는 있는데 조회만 실패한 경우 중복 insert로 이어질 수
 * 있다. 이제는 그대로 던져 retryable 실패로 처리되게 한다(outboxFlush.js가 이걸
 * outbox에 남겨 다음 flush가 다시 조회부터 시도하게 한다).
 *
 * 알려진 한계(DB 변경 필요): 이 자연키(vehicle_id
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
      code = (await import('../domain/drivers.js')).generateInviteCode()
      continue
    }
    throw error
  }
  throw lastError || new Error('초대 코드를 만들지 못했습니다. 잠시 후 다시 눌러 주세요.')
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
 * 0행 삭제(이미 없음/RLS로 안 보임)를 성공으로 치면
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
    throw new Error('이미 삭제됐거나 찾을 수 없습니다. 화면을 새로고침해 주세요.')
  }
}
