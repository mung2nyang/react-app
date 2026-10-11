// @ts-check
// 차주 hydrate: 서브 차량 fuel/maint/misc(차량번호 태그) → 차주 목록(expenses). 연동 서브도 공용 장부(5-B-2).
// hydrateEmployedDriver는 이 모듈을 쓰지 않는다.
import { supabase } from '../supabaseClient.js'
import { mergeExpenseKind } from './hydrateMerge.js'
import { expenseFromFuelRecord, replaceFuelExpenses } from '../domain/fuelRecords.js'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../domain/maintenanceRecords.js'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../domain/miscExpenseRecords.js'
import { dedupeExpensesById } from '../domain/expenses.js'

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
 * 서브 차량 supabaseId로 비용 3종을 모아 vehicleNumber 태그를 붙여 차주 목록(expenses)에 id 중복 제거로 합친다.
 * 연동 서브도 차주·기사 공용 장부라 차주 목록으로(읽기 전용 driverExpenses는 빈 배열).
 * @param {Array<CarLike>} cars
 * @param {Array<DriverRecord>} _drivers 연동 여부로 나누지 않음(호출부 모양 유지용)
 * @param {Array<JsonRecord>} ownerExpenses
 * @param {(labeled: Record<string, SupabaseQueryError>) => void} throwIfAnyHydrateError
 * @returns {Promise<{ expenses: Array<JsonRecord>, driverExpenses: Array<DriverExpenseItem> }>}
 */
export async function fetchOwnerDriverExpenses(cars, _drivers, ownerExpenses, throwIfAnyHydrateError) {
  const subCars = (Array.isArray(cars) ? cars : []).filter((car) => {
    if (car?.type !== 'sub' || car.supabaseId == null) return false
    return String(car.number || '').trim() !== ''
  })
  if (!subCars.length) return { expenses: ownerExpenses, driverExpenses: [] }

  const batches = await Promise.all(subCars.map((car) => {
    const vehicleNumber = String(car.number || '').trim()
    return fetchTaggedExpensesForVehicle(/** @type {string|number} */ (car.supabaseId), vehicleNumber, throwIfAnyHydrateError)
  }))
  return { expenses: dedupeExpensesById([...ownerExpenses, ...batches.flat()]), driverExpenses: [] }
}
