// @ts-check
/** @typedef {import('../../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 소속기사 본인 매출은 배정 차량 1대로 좁힌다 — getMonthlyFareRevenue는 그대로, 부르는 쪽이 settings·workData를 좁힌다.

/** @typedef {import('../../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../../domain/financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('../../domain/financeTypes.js').CarLike} CarLike */

/** @param {JsonValue|undefined} value */
export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

/**
 * Match session.phone to drivers[].phone by digits; require linked + vehicleNumber.
 * @param {Array<DriverRecord>|null|undefined} drivers
 * @param {string|null|undefined} sessionPhone
 * @returns {string|null}
 */
export function resolveDriverVehicleNumber(drivers, sessionPhone) {
  const want = phoneDigits(sessionPhone)
  if (want.length < 10) return null
  const list = Array.isArray(drivers) ? drivers : []
  const match = list.find((driver) => phoneDigits(driver?.phone) === want)
  if (!match || match.status !== 'linked') return null
  const vehicleNumber = String(match.vehicleNumber || '').trim()
  return vehicleNumber || null
}

/**
 * @param {WorkDataByLogId|null|undefined} workDataByLogId
 * @param {string|null|undefined} vehicleNumber
 * @returns {WorkDataByLogId}
 */
export function scopeWorkDataToVehicle(workDataByLogId, vehicleNumber) {
  if (!vehicleNumber) return {}
  const data = workDataByLogId?.[vehicleNumber]
  return { [vehicleNumber]: data && typeof data === 'object' ? data : {} }
}

/**
 * @param {FinanceSettings} settings
 * @param {string|null|undefined} vehicleNumber
 * @returns {FinanceSettings}
 */
export function scopeSettingsToVehicle(settings, vehicleNumber) {
  const cars = Array.isArray(settings?.cars) ? settings.cars : []
  if (!vehicleNumber) return { ...settings, cars: [] }
  return {
    ...settings,
    cars: cars.filter((/** @type {CarLike} */ car) => car?.number === vehicleNumber),
  }
}
