// @ts-check
// 거래처 저장 + domain/clients.js 재수출 배럴.
import { commitClients } from '../store/commitHelpers.js'

/**
 * @param {string} ownerKey
 * @param {import('../domain/clientTypes.js').ClientLike[]} clients
 */
export function saveClients(ownerKey, clients) {
  commitClients(ownerKey, clients)
}

export * from '../domain/clients.js'
