// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — Supabase를 직접 호출하는 "실행기"
// 함수들. outboxFlush.js가 이 함수들을 재시도 대상으로 호출하고, 사용자가 즉시 시도할
// 때도 같은 함수를 쓴다(실행기가 하나뿐이라 "즉시 시도"와 "재시도"가 항상 같은 코드
// 경로를 탄다). 전부 삭제는 delete-of-already-deleted-row가 에러 없이 성공하는
// Supabase 기본 동작에 기대어 자연히 idempotent하다 — 중간에 실패한 테이블 뒤부터
// 다시 실행돼도 안전하다.
import { supabase } from '../supabaseClient.js'
import { assertCloudWriteReady, getCloudUserId } from './cloudSession.js'
import { rangesOverlap } from './cloudStorage.js'

export async function deleteVehicleFromSupabase(vehicleSupabaseId) {
  if (!vehicleSupabaseId) return
  assertCloudWriteReady()
  const childResults = await Promise.all([
    supabase.from('transport_details').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('maintenance_records').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('fuel_records').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('misc_expense_records').delete().eq('vehicle_id', vehicleSupabaseId),
  ])
  const childError = childResults.find((result) => result.error)?.error
  if (childError) throw childError
  const { error: dailyLogsError } = await supabase.from('daily_logs').delete().eq('vehicle_id', vehicleSupabaseId)
  if (dailyLogsError) throw dailyLogsError
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleSupabaseId)
  if (error) throw error
}

export async function deleteClientFromSupabase(clientSupabaseId) {
  if (!clientSupabaseId) return
  assertCloudWriteReady()
  const unlinkResults = await Promise.all([
    supabase.from('transport_details').update({ client_id: null }).eq('client_id', clientSupabaseId),
    supabase.from('tax_invoices').update({ client_id: null }).eq('client_id', clientSupabaseId),
  ])
  const unlinkError = unlinkResults.find((result) => result.error)?.error
  if (unlinkError) throw unlinkError
  const { error } = await supabase.from('clients').delete().eq('id', clientSupabaseId)
  if (error) throw error
}

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
 * 사용자 지시 8번 — 신규 insert의 서버 응답이 유실된 뒤 재시도해도 진짜로
 * 수렴하게 하는 idempotency 조회. "같은 차량 + 같은 시작일 + 같은 초대코드"로
 * 이미 pending 행이 있으면, 그건 방금 응답만 못 받은 내 이전 시도가 실제로는
 * 성공했다는 뜻이다 — 다시 insert하는 대신 그 행을 그대로 쓴다.
 */
export async function findExistingDriverLinkInsert(vehicleId, assignmentStart, inviteCode) {
  const { data, error } = await supabase
    .from('driver_links')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('assignment_start', assignmentStart)
    .eq('invite_code', inviteCode)
    .maybeSingle()
  if (error) return null // 조회 자체가 실패하면 "없다"로 보고 평소처럼 진행한다.
  // .maybeSingle()은 원래 단일 행 또는 null만 돌려준다 — 배열이 오면(빈 배열 포함)
  // "찾았다"로 착각하면 안 된다. 빈 배열은 truthy라 `data || null`만으로는 못 거른다.
  if (!data || Array.isArray(data)) return null
  return data
}

export async function upsertDriverLinkOnSupabase({ supabaseId, vehicleId, inviteCode, assignmentStart, assignmentEnd }) {
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
    if (error) throw error
    return data
  }

  const ownPrior = await findExistingDriverLinkInsert(vehicleId, assignmentStart, inviteCode)
  if (ownPrior) return ownPrior

  let code = inviteCode
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase.from('driver_links').insert({ ...baseRow, invite_code: code, status: 'pending' }).select().single()
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

export async function updateDriverLinkStatusOnSupabase(supabaseId, status) {
  if (!supabaseId) return
  assertCloudWriteReady()
  const { error } = await supabase.from('driver_links').update({ status, updated_at: new Date().toISOString() }).eq('id', supabaseId)
  if (error) throw error
}

export async function deleteDriverLinkOnSupabase(supabaseId) {
  if (!supabaseId) return
  assertCloudWriteReady()
  const { error } = await supabase.from('driver_links').delete().eq('id', supabaseId)
  if (error) throw error
}
