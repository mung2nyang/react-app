// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 거래처 localStorage I/O + domain/clients.js 재수출 배럴.
import { readJsonKey } from '../store/persist.js'
import { commitClients } from '../store/commitHelpers.js'

/** @param {string} [ownerKey] */
export function loadClients(ownerKey = 'guest') {
  const parsed = readJsonKey('clients', ownerKey, /** @type {Array<JsonValue>} */ ([]))
  return Array.isArray(parsed) ? parsed : []
}

/**
 * @param {string} ownerKey
 * @param {import('../domain/clientTypes.js').ClientLike[]} clients
 */
export function saveClients(ownerKey, clients) {
  commitClients(ownerKey, clients)
}

export * from '../domain/clients.js'
