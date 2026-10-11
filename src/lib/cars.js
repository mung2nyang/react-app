// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 차량 localStorage I/O + domain/cars.js 재수출 배럴.
import { readJsonKey } from '../store/persist.js'
import { commitCars } from '../store/commitHelpers.js'
import { dedupeCarsById } from '../domain/cars.js'

/** @param {string} [ownerKey] */
export function loadCars(ownerKey = 'guest') {
  const parsed = readJsonKey('cars', ownerKey, /** @type {Array<JsonValue>} */ ([]))
  return Array.isArray(parsed)
    ? dedupeCarsById(/** @type {{ id?: string|number }[]} */ (parsed))
    : []
}

/**
 * @param {string} ownerKey
 * @param {import('../domain/financeTypes.js').CarLike[]} cars
 */
export function saveCars(ownerKey, cars) {
  commitCars(ownerKey, cars)
}

export * from '../domain/cars.js'
