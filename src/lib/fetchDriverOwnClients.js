// @ts-check
import { supabase } from '../supabaseClient.js'

/**
 * 기사 본인이 등록한 거래처 목록을 Supabase에서 조회한다(읽기 전용).
 * driver_direct(기사 직접 정산) 모드에서 차주가 조회하기 위한 함수.
 * 1) driver_links에서 linkSupabaseId로 driver_id 조회
 * 2) clients에서 user_id = driver_id 조회
 * 실패하거나 RLS로 0건인 경우 에러를 던지지 않고 빈 배열 []을 반환한다.
 *
 * @param {number|string|null|undefined} linkSupabaseId driver_links 테이블 행의 id
 * @returns {Promise<Array<import('../domain/clientTypes.js').ClientLike>>}
 */
export async function fetchDriverOwnClients(linkSupabaseId) {
  if (linkSupabaseId == null || linkSupabaseId === '') return []
  try {
    const { data: linkRow, error: linkError } = await supabase
      .from('driver_links')
      .select('driver_id')
      .eq('id', linkSupabaseId)
      .maybeSingle()

    if (linkError || !linkRow || typeof linkRow !== 'object' || !linkRow.driver_id) {
      return []
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', linkRow.driver_id)
      .order('display_order', { ascending: true })

    if (error || !Array.isArray(data)) {
      return []
    }

    return data.map((row) => {
      const raw = row && typeof row === 'object' && row.raw && typeof row.raw === 'object' ? row.raw : {}
      return {
        ...raw,
        id: String(row?.id || raw.id || ''),
        companyName: typeof row?.company_name === 'string' ? row.company_name : String(raw.companyName || ''),
        bizNumber: typeof row?.biz_number === 'string' ? row.biz_number : String(raw.bizNumber || ''),
        managerName: typeof row?.manager_name === 'string' ? row.manager_name : String(raw.managerName || ''),
      }
    })
  } catch {
    return []
  }
}
