// @ts-check
// Step 9 슬라이스 B §1-A: 차주 사이드 메뉴 "[번호] 일지" = 연동 안 된 sub만.
import { getShortCarNum } from '../domain/cars.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {{ number: string, label: string }} SubLogMenuItem */

/**
 * @param {Array<CarLike>|null|undefined} cars
 * @param {Array<DriverRecord>|null|undefined} drivers
 * @param {boolean} isOwnerSession 소속기사(linkedOwnerId)면 false
 * @returns {Array<SubLogMenuItem>}
 */
export function buildSubLogMenuItems(cars, drivers, isOwnerSession) {
  if (!isOwnerSession) return []
  const linkedNumbers = new Set(
    (Array.isArray(drivers) ? drivers : [])
      .filter((driver) => {
        const status = String(driver?.status || '')
        const number = String(driver?.vehicleNumber || '').trim()
        return status !== 'disconnected' && number !== ''
      })
      .map((driver) => String(driver.vehicleNumber).trim()),
  )
  return (Array.isArray(cars) ? cars : [])
    .filter((car) => {
      const number = String(car?.number || '').trim()
      return car?.type === 'sub' && number && !linkedNumbers.has(number)
    })
    .map((car) => {
      const number = String(car.number || '').trim()
      return { number, label: getShortCarNum(number) }
    })
}
