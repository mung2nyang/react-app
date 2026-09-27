// @ts-check
// 차주 hydrate: 서브 차량 fuel/maint/misc(차량번호 태그) → 연동은 driverExpenses, 미연동은 expenses.
// expenses 배열·저장 경로와 분리(Q3). hydrateEmployedDriver는 이 모듈을 쓰지 않는다.
import { supabase } from '../supabaseClient.js'
import { mergeExpenseKind } from './hydrateMerge.js'
import { expenseFromFuelRecord, replaceFuelExpenses } from '../domain/fuelRecords.js'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../domain/maintenanceRecords.js'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../domain/miscExpenseRecords.js'
import { dedupeExpensesById } from '../domain/expenses.js'
import { isLinkedPlate } from '../domain/expenseVehicleRouting.js'

/** @typedef {import('../domain/expenseTypes.js').DriverExpenseItem} DriverExpenseItem */
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('./hydrateMergeTypes.js').SupabaseQueryError} SupabaseQueryError */
/** @typedef {import('./hydrateMergeTypes.js').JsonRecord} JsonRecord */

/**
 * @param {string|number} vehicleId
 * @param {string} vehicleNumber
 * @param {(labeled: Record<string, SupabaseQueryError>) => void} throwIfAnyHydrateError
 * @returns {Promise<Array<DriverExpenseItem>>}
 */
async function fetchTaggedExpensesForVehicle(vehicleId, vehicleNumber, throwIfAnyHydrateError) {
  const [fuelRes, maintRes, miscRes] = await Promise.all([
    supabase.from('fuel_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
    supabase.from('maintenance_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
    supabase.from('misc_expense_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
  ])
  throwIfAnyHydrateError({
    [`fuel_records:${vehicleNumber}`]: fuelRes.error,
    [`maintenance_records:${vehicleNumber}`]: maintRes.error,
    [`misc_expense_records:${vehicleNumber}`]: miscRes.error,
  })
  /** @type {Array<JsonRecord>} */
  let next = []
  next = mergeExpenseKind({ kind: 'fuel', currentExpenses: next, snapshotExpenses: [], previousExpenses: [], rows: fuelRes.data || [], mapRow: expenseFromFuelRecord, replace: replaceFuelExpenses })
  next = mergeExpenseKind({ kind: 'maint', currentExpenses: next, snapshotExpenses: [], previousExpenses: [], rows: maintRes.data || [], mapRow: expenseFromMaintenanceRecord, replace: replaceMaintExpenses })
  next = mergeExpenseKind({ kind: 'misc', currentExpenses: next, snapshotExpenses: [], previousExpenses: [], rows: miscRes.data || [], mapRow: expenseFromMiscRecord, replace: replaceMiscExpenses })
  return /** @type {Array<DriverExpenseItem>} */ (next.map((item) => ({ ...item, vehicleNumber })))
}

/**
 * 서브 차량 supabaseId로 비용 3종을 모아 vehicleNumber 태그를 붙인다.
 * 로드맵 5-A: 미연동 서브는 차주 목록(expenses)에 id 중복 제거로 합치고, 연동 서브만 읽기 전용.
 * @param {Array<CarLike>} cars
 * @param {Array<DriverRecord>} drivers
 * @param {Array<JsonRecord>} ownerExpenses
 * @param {(labeled: Record<string, SupabaseQueryError>) => void} throwIfAnyHydrateError
 * @returns {Promise<{ expenses: Array<JsonRecord>, driverExpenses: Array<DriverExpenseItem> }>}
 */
export async function fetchOwnerDriverExpenses(cars, drivers, ownerExpenses, throwIfAnyHydrateError) {
  const subCars = (Array.isArray(cars) ? cars : []).filter((car) => {
    if (car?.type !== 'sub' || car.supabaseId == null) return false
    return String(car.number || '').trim() !== ''
  })
  if (!subCars.length) return { expenses: ownerExpenses, driverExpenses: [] }

  const batches = await Promise.all(subCars.map(async (car) => {
    const vehicleNumber = String(car.number || '').trim()
    const items = await fetchTaggedExpensesForVehicle(/** @type {string|number} */ (car.supabaseId), vehicleNumber, throwIfAnyHydrateError)
    return { linked: isLinkedPlate(vehicleNumber, drivers), items }
  }))
  const ownerSub = batches.filter((batch) => !batch.linked).flatMap((batch) => batch.items)
  return {
    expenses: dedupeExpensesById([...ownerExpenses, ...ownerSub]),
    driverExpenses: batches.filter((batch) => batch.linked).flatMap((batch) => batch.items),
  }
}
