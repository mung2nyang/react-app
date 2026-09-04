// @ts-check
/** @typedef {import('../../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../../domain/financeTypes.js').DriverLinkLike} DriverLinkLike */

/**
 * Store DriverRecord → 도메인 link shape(정산·배정기간 계산용).
 * @param {DriverRecord} driver
 * @returns {DriverLinkLike & { driverName?: string, phone?: string }}
 */
export function toLinkedDriverLink(driver) {
  return {
    id: driver.id,
    vehicleNumber: driver.vehicleNumber || '',
    assignmentStart: driver.startDate || '',
    assignmentEnd: driver.endDate || '',
    status: driver.status,
    driverName: driver.name || '',
    phone: driver.phone || '',
  }
}
