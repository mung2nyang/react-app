// @ts-check
// Step 4 도메인 폴더 이동: 순수 계산은 domain/cars.js로 옮겼다. 이 파일은 localStorage
// I/O(loadCars/saveCars)만 남기고, 기존 임포트 경로('../lib/cars.js')를 유지하는
// 배럴로 domain/cars.js를 재수출한다.
import { readJsonKey } from '../store/persist.js'
import { commitCars } from '../store/commitHelpers.js'
import { dedupeCarsById } from '../domain/cars.js'

/** @param {string} [ownerKey] */
export function loadCars(ownerKey = 'guest') {
  const parsed = readJsonKey('cars', ownerKey, /** @type {unknown[]} */ ([]))
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
