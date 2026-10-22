// @ts-check
// 기사 저장(saveDrivers→commitDrivers). 화면 읽기는 useOwnerDrivers / readOwnerDrivers, 계산 규칙은 domain/drivers.js.
import { commitDrivers } from '../store/commitHelpers.js'

/**
 * @param {string} ownerKey
 * @param {import('../../domain/driverTypes.ts').DriverRecord[]} items
 */
export function saveDrivers(ownerKey, items) {
  commitDrivers(ownerKey, items)
}
