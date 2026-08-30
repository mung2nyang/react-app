// @ts-check
// 원격 upsert가 돌려준 supabaseId만, 지금 Store에 있는 같은 로컬 id 항목에 붙인다.
// 스냅샷 배열을 통째로 덮어쓰면 await 동안 고친 필드/순서가 과거 값으로 되돌아간다.
import { commitBatch, getState } from '../store/app-store.js'

/**
 * @param {'cars'|'clients'} domain
 * @param {string} ownerKey
 * @param {string} localId
 * @param {string|number} supabaseId
 * @returns {boolean} persist+notify가 나갔으면 true
 */
export function mergeRemoteIdByLocalId(domain, ownerKey, localId, supabaseId) {
  if (!localId || supabaseId == null || supabaseId === '') return false
  if (domain === 'cars') {
    const list = getState().cars[ownerKey] || []
    const current = list.find((item) => item.id === localId)
    if (!current) return false
    if (String(current.supabaseId ?? '') === String(supabaseId)) return false
    const next = list.map((item) => (item.id === localId ? { ...item, supabaseId: String(supabaseId) } : item))
    commitBatch([{ domain: 'cars', ownerKey, value: next }], { persist: true, syncToCloud: false })
    return true
  }
  const list = getState().clients[ownerKey] || []
  const current = list.find((item) => item.id === localId)
  if (!current) return false
  if (String(current.supabaseId ?? '') === String(supabaseId)) return false
    const next = list.map((item) => (item.id === localId ? { ...item, supabaseId: String(supabaseId) } : item))
  commitBatch([{ domain: 'clients', ownerKey, value: next }], { persist: true, syncToCloud: false })
  return true
}
