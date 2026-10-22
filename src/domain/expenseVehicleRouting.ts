// 정비/주유/기타를 서버 차량 칸별로 나눈다. 연동 서브차량은 항목 단위 공용 장부.
import type { CarLike } from './financeTypes.ts'
import type { ExpenseItem } from './expenseTypes.ts'
import type { DriverRecord } from './driverTypes.ts'

export type ExpenseVehicleTarget = {
  vehicleId: string | number
  /** 'main' 또는 서브 차량번호(workLogs 키) */
  logId: string
  expenses: Array<ExpenseItem>
  /** dates = 차주만 쓰는 칸, items = 연동 공용 칸 */
  mode: 'dates' | 'items'
}

/** 그 차량번호에 연동 중(`linked`)인 기사가 있으면 true. 초대 대기는 미연동. */
export function isLinkedPlate(plate: string, drivers: Array<DriverRecord> | null | undefined) {
  const want = String(plate || '').trim()
  if (!want) return false
  return (Array.isArray(drivers) ? drivers : []).some(
    (driver) => driver.status === 'linked' && String(driver.vehicleNumber || '').trim() === want,
  )
}

/**
 * 서브 표시 항목 → 그 서브차량 칸(미연동 dates·연동 items), 나머지 → 메인(기존 선택) 칸. 서브 대상이 앞, 메인이 맨 뒤.
 * 서브차량은 항목이 없어도 대상에 넣는다 — 마지막 항목을 지운 것도 서버에 반영해야 한다.
 */
export function planExpenseVehicleTargets(cars: Array<CarLike> | null | undefined, drivers: Array<DriverRecord> | null | undefined, expenses: Array<ExpenseItem> | null | undefined): Array<ExpenseVehicleTarget> {
  const carList = Array.isArray(cars) ? cars : []
  const mainCar = carList.find((car) => car.type === 'main' && car.supabaseId) || carList.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return []

  const subTargets = new Map<string, ExpenseVehicleTarget>()
  const mainItems: Array<ExpenseItem> = []
  for (const car of carList) {
    const plate = String(car.number || '').trim()
    if (car === mainCar || car.type !== 'sub' || !car.supabaseId || !plate) continue
    const mode = isLinkedPlate(plate, drivers) ? 'items' : 'dates'
    subTargets.set(plate, { vehicleId: car.supabaseId, logId: plate, expenses: [], mode })
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
      target = { vehicleId: subCar.supabaseId, logId: plate, expenses: [], mode: 'dates' }
      subTargets.set(plate, target)
    }
    target.expenses.push(item)
  }

  return [
    ...subTargets.values(),
    { vehicleId: mainCar.supabaseId, logId: 'main', expenses: mainItems, mode: 'dates' },
  ]
}
