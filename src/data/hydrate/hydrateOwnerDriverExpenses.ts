// 차주 hydrate: 서브 차량 fuel/maint/misc(차량번호 태그) → 차주 목록(expenses). 연동 서브도 공용 장부(5-B-2).
// hydrateEmployedDriver는 이 모듈을 쓰지 않는다.
import { supabase } from '../cloud/supabaseClient.ts'
import { mergeExpenseKind } from './hydrateMerge.ts'
import { expenseFromFuelRecord, replaceFuelExpenses } from '../../domain/fuelRecords.ts'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../../domain/maintenanceRecords.ts'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../../domain/miscExpenseRecords.ts'
import { dedupeExpensesById } from '../../domain/expenses.ts'
import { fetchAllRows } from '../cloud/fetchAllRows.ts'
import type { DriverExpenseItem } from '../../domain/expenseTypes.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { JsonRecord, SupabaseQueryError } from './hydrateMergeTypes.ts'

async function fetchTaggedExpensesForVehicle(vehicleId: string | number, vehicleNumber: string, throwIfAnyHydrateError: (labeled: Record<string, SupabaseQueryError>) => void): Promise<Array<DriverExpenseItem>> {
  const [fuelRes, maintRes, miscRes] = await Promise.all([
    fetchAllRows(() => supabase.from('fuel_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id')),
    fetchAllRows(() => supabase.from('maintenance_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id')),
    fetchAllRows(() => supabase.from('misc_expense_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id')),
  ])
  throwIfAnyHydrateError({
    [`fuel_records:${vehicleNumber}`]: fuelRes.error,
    [`maintenance_records:${vehicleNumber}`]: maintRes.error,
    [`misc_expense_records:${vehicleNumber}`]: miscRes.error,
  })
  let next: Array<JsonRecord> = []
  next = mergeExpenseKind({ kind: 'fuel', currentExpenses: next, snapshotExpenses: [], previousExpenses: [], rows: fuelRes.data || [], mapRow: expenseFromFuelRecord, replace: replaceFuelExpenses })
  next = mergeExpenseKind({ kind: 'maint', currentExpenses: next, snapshotExpenses: [], previousExpenses: [], rows: maintRes.data || [], mapRow: expenseFromMaintenanceRecord, replace: replaceMaintExpenses })
  next = mergeExpenseKind({ kind: 'misc', currentExpenses: next, snapshotExpenses: [], previousExpenses: [], rows: miscRes.data || [], mapRow: expenseFromMiscRecord, replace: replaceMiscExpenses })
  return (next.map((item) => ({ ...item, vehicleNumber }))) as Array<DriverExpenseItem>
}

/**
 * 서브 차량 supabaseId로 비용 3종을 모아 vehicleNumber 태그를 붙여 차주 목록(expenses)에 id 중복 제거로 합친다.
 * 연동 서브도 차주·기사 공용 장부라 차주 목록으로(읽기 전용 driverExpenses는 빈 배열).
 * @param _drivers 연동 여부로 나누지 않음(호출부 모양 유지용)
 */
export async function fetchOwnerDriverExpenses(cars: Array<CarLike>, _drivers: Array<DriverRecord>, ownerExpenses: Array<JsonRecord>, throwIfAnyHydrateError: (labeled: Record<string, SupabaseQueryError>) => void): Promise<{ expenses: Array<JsonRecord>, driverExpenses: Array<DriverExpenseItem> }> {
  const subCars = (Array.isArray(cars) ? cars : []).filter((car) => {
    if (car?.type !== 'sub' || car.supabaseId == null) return false
    return String(car.number || '').trim() !== ''
  })
  if (!subCars.length) return { expenses: ownerExpenses, driverExpenses: [] }

  const batches = await Promise.all(subCars.map((car) => {
    const vehicleNumber = String(car.number || '').trim()
    return fetchTaggedExpensesForVehicle((car.supabaseId) as string | number, vehicleNumber, throwIfAnyHydrateError)
  }))
  return { expenses: dedupeExpensesById([...ownerExpenses, ...batches.flat()]), driverExpenses: [] }
}
