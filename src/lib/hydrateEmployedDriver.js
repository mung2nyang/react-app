// @ts-check
// employed_driver hydrate: use RPCs instead of profiles/vehicles row SELECT.
// Skip clients / tax invoices (least privilege). 비용 3종은 배정 차량 기준으로 조회.
//
// 소속기사 일지 키: UI·일일운행은 workLogs.main 만 쓴다. mergeVehicleDayLogsFromServer
// 는 sub 차량을 번호판 키로 넣으므로, 여기서 main 으로 재매핑한다.
// TODO(multi-vehicle): 배정 차량 2대+ 이면 현재는 cars[0]만 main·expenses 에 쓰고
// 나머지는 버린다(나중 슬라이스에서 다중 배정 UI·집계와 함께 처리).
import { expenseFromFuelRecord, replaceFuelExpenses } from '../domain/fuelRecords.js'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../domain/maintenanceRecords.js'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../domain/miscExpenseRecords.js'
import { normalizeSettings } from '../domain/practiceSettings.js'
import {
  fetchAssignedVehicleSummary,
  fetchLinkedOwnerProfileSettings,
} from './driverLinkRpc.js'
import { mergeDriversFromRows, mergeExpenseKind } from './hydrateMerge.js'
import { logIdForCar, mergeVehicleDayLogsFromServer } from './hydrateVehicleDayLogs.js'
import { supabase } from '../supabaseClient.js'

/** @typedef {import('./hydrateMergeTypes.js').LocalCar} LocalCar */
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

/**
 * @param {{ id: string, number?: string, type?: string, tonnage?: string, settlement_mode?: string|null, driver_pay_mode?: string|null, driver_salary_amount?: number|string|null, comm_enabled?: boolean|null, comm_type?: string|null, comm_value?: string|number|null }} row
 * @returns {LocalCar}
 */
export function carFromAssignedSummary(row) {
  return {
    id: `car-${row.id}`,
    number: row.number || '',
    type: row.type === 'main' ? 'main' : 'sub',
    tonnage: row.tonnage || '',
    supabaseId: row.id,
    settlementMode: row.settlement_mode || 'default',
    driverPayMode: row.driver_pay_mode || 'revenue',
    driverSalaryAmount: row.driver_salary_amount ?? '',
    commEnabled: !!row.comm_enabled,
    commType: row.comm_type || 'percent',
    commission: row.comm_value ?? '',
    infoType: 'existing',
    driverName: '',
    driverPhone: '',
    driverLinkId: '',
  }
}

/**
 * 배정차 서버 일지(번호판 키) → workLogs.main. 번호판 키는 남기지 않는다.
 * cars 가 비면 { main: {} }. logIdForCar(undefined) 호출 없음.
 * @param {Record<string, Record<string, DayRecordLike>>|null|undefined} workLogs
 * @param {Array<CarLike|LocalCar>|null|undefined} cars
 * @returns {{ main: Record<string, DayRecordLike> }}
 */
export function remapEmployedDriverWorkLogs(workLogs, cars) {
  const list = Array.isArray(cars) ? cars : []
  if (list.length === 0) return { main: {} }

  const primary = list[0]
  const plateKey = logIdForCar(/** @type {CarLike} */ (primary))
  if (!plateKey || plateKey === 'main') {
    return { main: (workLogs && workLogs.main) ? workLogs.main : {} }
  }
  const plateData = workLogs && workLogs[plateKey] ? workLogs[plateKey] : {}
  return { main: plateData }
}

/**
 * hydrate.js:138-153 과 동일 — mergeExpenseKind / expenseFrom*Record 재사용.
 * @param {string|number} vehicleId
 * @param {(labeled: Record<string, import('./hydrateMergeTypes.js').SupabaseQueryError>) => void} throwIfAnyHydrateError
 * @returns {Promise<Array<ExpenseItem>>}
 */
async function fetchExpensesForAssignedVehicle(vehicleId, throwIfAnyHydrateError) {
  const [fuelRes, maintRes, miscRes] = await Promise.all([
    supabase.from('fuel_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
    supabase.from('maintenance_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
    supabase.from('misc_expense_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
  ])
  throwIfAnyHydrateError({
    fuel_records: fuelRes.error,
    maintenance_records: maintRes.error,
    misc_expense_records: miscRes.error,
  })
  /** @type {Array<import('./hydrateMergeTypes.js').JsonRecord>} */
  let nextExpenses = []
  nextExpenses = mergeExpenseKind({ kind: 'fuel', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: fuelRes.data || [], mapRow: expenseFromFuelRecord, replace: replaceFuelExpenses })
  nextExpenses = mergeExpenseKind({ kind: 'maint', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: maintRes.data || [], mapRow: expenseFromMaintenanceRecord, replace: replaceMaintExpenses })
  nextExpenses = mergeExpenseKind({ kind: 'misc', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: miscRes.data || [], mapRow: expenseFromMiscRecord, replace: replaceMiscExpenses })
  return /** @type {Array<ExpenseItem>} */ (nextExpenses)
}

/**
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.ownerKey
 * @param {(labeled: Record<string, import('./hydrateMergeTypes.js').SupabaseQueryError>) => void} args.throwIfAnyHydrateError
 * @param {string|null|undefined} [args.driverPhone]
 * @param {Array<DriverRecord>} args.localDrivers
 */
export async function buildEmployedDriverSnapshot({
  userId, ownerKey, throwIfAnyHydrateError, driverPhone, localDrivers,
}) {
  const [ownerProfile, vehicleRows, linksRes, selfProfileRes] = await Promise.all([
    fetchLinkedOwnerProfileSettings(ownerKey),
    fetchAssignedVehicleSummary(),
    supabase.from('driver_links').select('*').eq('driver_id', userId).eq('status', 'linked'),
    supabase.from('profiles').select('phone').eq('id', userId).maybeSingle(),
  ])
  throwIfAnyHydrateError({
    driver_links: linksRes.error,
    profiles_self: selfProfileRes.error,
  })

  /** @type {Record<string, unknown>} */
  const settingsJson = (ownerProfile?.settings && typeof ownerProfile.settings === 'object'
    && !Array.isArray(ownerProfile.settings))
    ? /** @type {Record<string, unknown>} */ (ownerProfile.settings)
    : {}
  const themeRaw = settingsJson.theme
  const nextSettings = normalizeSettings({
    ...settingsJson,
    theme: (themeRaw === 'dark' || themeRaw === 'light') ? themeRaw : 'light',
  })
  const nextProfile = {
    name: ownerProfile?.name || '',
    phone: '',
    bizName: ownerProfile?.business_name || '',
  }
  /** @type {Array<LocalCar>} */
  const nextCars = (vehicleRows || []).map((row) => carFromAssignedSummary(row))
  let nextDrivers = /** @type {Array<DriverRecord>} */ (
    mergeDriversFromRows(localDrivers, nextCars, linksRes.data || [])
  )
  const phone = String(driverPhone || selfProfileRes.data?.phone || '').trim()
  if (phone) {
    nextDrivers = nextDrivers.map((driver) => (
      driver.status === 'linked' && !driver.phone ? { ...driver, phone } : driver
    ))
  }

  const { workLogs: rawWorkLogs } = await mergeVehicleDayLogsFromServer({
    cars: nextCars,
    mainTombstoneKeys: [],
    fetchDaily: (vehicleId) => supabase.from('daily_logs').select('*').eq('vehicle_id', vehicleId),
    fetchTransport: (vehicleId) => supabase
      .from('transport_details')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('sequence', { ascending: true }),
    throwIfAnyHydrateError,
  })
  const workLogs = remapEmployedDriverWorkLogs(rawWorkLogs, nextCars)

  const assignedVehicleId = nextCars[0]?.supabaseId
  const nextExpenses = assignedVehicleId != null
    ? await fetchExpensesForAssignedVehicle(assignedVehicleId, throwIfAnyHydrateError)
    : []

  return {
    workData: workLogs.main || {},
    workLogs,
    cars: nextCars,
    clients: [],
    drivers: nextDrivers,
    profile: nextProfile,
    settings: nextSettings,
    expenses: nextExpenses,
    invoices: [],
  }
}
