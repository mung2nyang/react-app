// @ts-check
// Step 4 도메인 폴더 이동: 순수 계산은 domain/drivers.js로 옮겼다. 이 파일은 persist
// 배럴(loadDrivers)과 saveDrivers→commitDrivers만 남긴다. 화면 읽기는
// useOwnerDrivers / readOwnerDrivers.
import { readJsonKey } from '../store/persist.js'
import { commitDrivers } from '../store/commitHelpers.js'

/** @param {string} [ownerKey] */
export function loadDrivers(ownerKey = 'guest') {
  const parsed = readJsonKey('drivers', ownerKey, /** @type {unknown[]} */ ([]))
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
