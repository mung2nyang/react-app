// @ts-check
/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */

/**
 * 기사 관리 화면 모드 판별 + car/driver 조회(순수).
 * linkId → 연동 모드, logId → 미연동 서브차량 모드.
 *
 * @param {{ linkId?: string, logId?: string }} params
 * @param {Array<DriverRecord>|null|undefined} drivers
 * @param {Array<CarLike>|null|undefined} cars
 * @returns {{
 *   mode: 'linked'|'unlinked'|null,
 *   notFound: boolean,
 *   driver: DriverRecord|null,
 *   car: CarLike|null,
 *   plate: string,
 * }}
 */
export function resolveDriverManagementContext(params, drivers, cars) {
  const linkId = String(params?.linkId || '').trim()
  const logId = String(params?.logId || '').trim()
  const driverList = Array.isArray(drivers) ? drivers : []
  const carList = Array.isArray(cars) ? cars : []

  if (linkId) {
    const driver = driverList.find((item) => item.id === linkId) || null
    if (!driver || driver.status !== 'linked') {
      return { mode: 'linked', notFound: true, driver: null, car: null, plate: '' }
    }
    const plate = String(driver.vehicleNumber || '').trim()
    const car = carList.find((item) => String(item.number || '').trim() === plate) || null
    return { mode: 'linked', notFound: false, driver, car, plate }
  }

  if (logId) {
    const plate = logId
    const linkedElsewhere = driverList.some((driver) => {
      const status = String(driver?.status || '')
      const number = String(driver?.vehicleNumber || '').trim()
      return status !== 'disconnected' && number === plate
    })
    const car = carList.find(
      (item) => item?.type === 'sub' && String(item.number || '').trim() === plate,
    ) || null
    if (!car || linkedElsewhere) {
      return { mode: 'unlinked', notFound: true, driver: null, car: null, plate }
    }
    return { mode: 'unlinked', notFound: false, driver: null, car, plate }
  }

  return { mode: null, notFound: true, driver: null, car: null, plate: '' }
}
