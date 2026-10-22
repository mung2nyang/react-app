// Supabase를 직접 부르는 실행기 함수. 삭제는 이미 없는 행 삭제도 성공이라 중간부터 다시 돌아도 안전하다.
// 모든 함수는 captured를 받아 원격 await마다 assertSessionStillCurrent로 세션을 재확인한다.
import type { SessionCapture } from './syncTypes.ts'
import { supabase } from '../cloud/supabaseClient.ts'
import { assertCloudWriteReady, assertSessionStillCurrent } from '../cloud/cloudSession.ts'

export async function deleteVehicleFromSupabase(vehicleSupabaseId: number | string | null | undefined, captured: SessionCapture) {
  if (!vehicleSupabaseId) return
  assertCloudWriteReady()
  // 딸린 표는 전부 vehicles ON DELETE CASCADE라 차량 한 줄만 지운다 — 서버가 거절하면 아무것도 안 지워진다(로드맵 37-B).
  // 0행 삭제를 성공으로 치면 서버 행이 남아 hydrate가 다시 그린다 — 지운 행이 0이면 throw(배열이 아니면 그 정보가 없어 통과).
  const { data, error } = await supabase.from('vehicles').delete().eq('id', vehicleSupabaseId).select('id')
  assertSessionStillCurrent(captured)
  if (error) throw error
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('이미 삭제됐거나 찾을 수 없습니다. 화면을 새로고침해 주세요.')
  }
}

export async function deleteClientFromSupabase(clientSupabaseId: number | string | null | undefined, captured: SessionCapture) {
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

export async function updateDriverLinkStatusOnSupabase(supabaseId: number | string | null | undefined, status: 'pending' | 'linked', captured: SessionCapture) {
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
 */
export async function deleteDriverLinkOnSupabase(supabaseId: number | string | null | undefined, captured: SessionCapture) {
  if (!supabaseId) return
  assertCloudWriteReady()
  const { data, error } = await supabase.from('driver_links').delete().eq('id', supabaseId).select('id')
  assertSessionStillCurrent(captured)
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('이미 삭제됐거나 찾을 수 없습니다. 화면을 새로고침해 주세요.')
  }
}
