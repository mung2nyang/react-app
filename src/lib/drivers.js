// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 기사 persist 배럴(loadDrivers)과 saveDrivers→commitDrivers + domain/drivers.js 재수출. 화면 읽기는 useOwnerDrivers / readOwnerDrivers.
import { readJsonKey } from '../store/persist.js'
import { commitDrivers } from '../store/commitHelpers.js'

/** @param {string} [ownerKey] */
export function loadDrivers(ownerKey = 'guest') {
  const parsed = readJsonKey('drivers', ownerKey, /** @type {Array<JsonValue>} */ ([]))
  return Array.isArray(parsed) ? parsed : []
}

/**
 * @param {string} ownerKey
 * @param {import('../lib/outboxTypes.js').DriverRecord[]} items
 */
export function saveDrivers(ownerKey, items) {
  commitDrivers(ownerKey, items)
}

export * from '../domain/drivers.js'
