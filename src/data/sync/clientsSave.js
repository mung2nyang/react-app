// @ts-check
// 거래처 저장(saveClients) — 계산 규칙은 domain/clients.js.
import { commitClients } from '../store/commitHelpers.js'

/**
 * @param {string} ownerKey
 * @param {import('../../domain/clientTypes.js').ClientLike[]} clients
 */
export function saveClients(ownerKey, clients) {
  commitClients(ownerKey, clients)
}
