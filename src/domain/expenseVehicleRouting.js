// @ts-check
// 정비/주유/기타를 서버 차량 칸별로 나눈다(로드맵 5-A). 연동 서브차량은 항목 단위 공용 장부(5-B-2).

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */

/**
 * @typedef {Object} ExpenseVehicleTarget
 * @property {string|number} vehicleId
 * @property {string} logId 'main' 또는 서브 차량번호(workLogs 키)
 * @property {Array<ExpenseItem>} expenses
 * @property {Array<string>} cleanupDates 이 칸에서 다른 칸으로 옮겨 간 항목의 날짜
 * @property {'dates'|'items'} mode dates = 날짜별 다시 쓰기(차주만 쓰는 칸), items = 항목 단위(연동 공용 칸)
 */

/**
 * 그 차량번호에 연동 중(`linked`)인 기사가 있으면 true. 초대 대기는 미연동.
 * @param {string} plate
 * @param {Array<DriverRecord>|null|undefined} drivers
 */
export function isLinkedPlate(plate, drivers) {
  const want = String(plate || '').trim()
  if (!want) return false
  return (Array.isArray(drivers) ? drivers : []).some(
    (driver) => driver.status === 'linked' && String(driver.vehicleNumber || '').trim() === want,
  )
}

/**
 * 서브 표시 항목 → 그 서브차량 칸(미연동 dates·연동 items), 나머지 → 메인(기존 선택) 칸. 서브 대상이 앞, 메인이 맨 뒤.
 * 서브차량은 항목이 없어도 대상에 넣는다 — 마지막 항목을 지운 것도 서버에 반영해야 한다.
 * @param {Array<CarLike>|null|undefined} cars
 * @param {Array<DriverRecord>|null|undefined} drivers
 * @param {Array<ExpenseItem>|null|undefined} expenses
 * @returns {Array<ExpenseVehicleTarget>}
 */
export function planExpenseVehicleTargets(cars, drivers, expenses) {
  const carList = Array.isArray(cars) ? cars : []
  const mainCar = carList.find((car) => car.type === 'main' && car.supabaseId) || carList.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return []

  /** @type {Map<string, ExpenseVehicleTarget>} */
  const subTargets = new Map()
  /** @type {Array<ExpenseItem>} */
  const mainItems = []
  /** @type {Set<string>} */
  const movedDates = new Set()
  for (const car of carList) {
    const plate = String(car.number || '').trim()
    if (car === mainCar || car.type !== 'sub' || !car.supabaseId || !plate) continue
    const mode = isLinkedPlate(plate, drivers) ? 'items' : 'dates'
    subTargets.set(plate, { vehicleId: car.supabaseId, logId: plate, expenses: [], cleanupDates: [], mode })
  }

  for (const item of expenses || []) {
    const plate = String(item.vehicleNumber || '').trim()
    const subCar = plate
      ? carList.find((car) => car !== mainCar && car.type === 'sub' && car.supabaseId && String(car.number || '').trim() === plate)
      : undefined
    if (!subCar?.supabaseId) {
      mainItems.push(item)
      continue
    }
    let target = subTargets.get(plate)
    if (!target) {
      target = { vehicleId: subCar.supabaseId, logId: plate, expenses: [], cleanupDates: [], mode: 'dates' }
      subTargets.set(plate, target)
    }
    target.expenses.push(item)
    if (item.date) movedDates.add(item.date)
  }

  return [
    ...subTargets.values(),
    { vehicleId: mainCar.supabaseId, logId: 'main', expenses: mainItems, cleanupDates: [...movedDates], mode: 'dates' },
  ]
}
