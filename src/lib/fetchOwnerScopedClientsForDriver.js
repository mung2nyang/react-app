// @ts-check
import { supabase } from '../supabaseClient.js'

/**
 * @typedef {Object} OwnerScopedClient
 * @property {string} companyName
 */

/**
 * 소속기사 본인 세션에서 차주가 해당 차량 전용으로 등록한 거래처 목록을 Supabase에서 조회한다(읽기 전용).
 * 라이브 DB RLS 정책("linked driver can read owner scoped clients")이 auth.uid()를 기준으로
 * 연동된 차주 + 배정 차량 scoped 거래처만 필터링하므로 클라이언트에서 owner_id/vehicleNumber 인자를
 * 넘길 필요가 없다.
 * 실패하거나 RLS로 0건인 경우 에러를 던지지 않고 빈 배열 []을 반환한다.
 *
 * @returns {Promise<Array<OwnerScopedClient>>}
 */
export async function fetchOwnerScopedClientsForDriver() {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('company_name')

    if (error || !Array.isArray(data)) {
      return []
    }

    /** @type {Array<OwnerScopedClient>} */
    const result = []
    for (const row of data) {
      if (row && typeof row === 'object' && typeof row.company_name === 'string') {
        const trimmed = row.company_name.trim()
        if (trimmed) {
          result.push({ companyName: trimmed })
        }
      }
    }
    return result
  } catch {
    return []
  }
}
