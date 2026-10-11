// @ts-check
// employed_driver hydrate: use RPCs instead of profiles/vehicles row SELECT.
// 거래처는 배정 차량 scopedToVehicleNumber만 조회. tax invoices는 스킵(least privilege).
// 비용 3종은 배정 차량 기준으로 조회.
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
  fetchLinkedOwnerBusinessInfo,
} from './driverLinkRpc.js'
import { carFromAssignedSummary } from './hydrateEmployedDriverCar.js'
import { mergeClientsFromRows, mergeDriversFromRows, mergeExpenseKind } from './hydrateMerge.js'
import { reconcileClients } from './outboxReconcile.js'
import { logIdForCar, mergeVehicleDayLogsFromServer } from './hydrateVehicleDayLogs.js'
import { supabase } from '../supabaseClient.js'

/** @typedef {import('./hydrateMergeTypes.js').LocalCar} LocalCar */
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

export { carFromAssignedSummary }

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
  // 차주가 넣은 항목의 차량 표시를 떼어 기사 본인 목록·매출에 포함한다.
  return /** @type {Array<ExpenseItem>} */ (nextExpenses.map(({ vehicleNumber: _vehicleNumber, ...item }) => item))
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
  // 배정 차량을 먼저 알아야 거래처를 scopedToVehicleNumber로 좁힐 수 있다 —
  // 예전엔 Promise.all로 동시 조회해서 차주 거래처 전체를 내려받았음.
  const [ownerInfo, vehicleRows, linksRes, selfProfileRes] = await Promise.all([
    fetchLinkedOwnerBusinessInfo(ownerKey),
    fetchAssignedVehicleSummary(),
    supabase.from('driver_links').select('*').eq('driver_id', userId).eq('status', 'linked'),
    supabase.from('profiles').select('name, phone, settings').eq('id', userId).maybeSingle(),
  ])
  throwIfAnyHydrateError({
    driver_links: linksRes.error,
    profiles_self: selfProfileRes.error,
  })

  // docs/sot.md §0(연동 기사 앱의 개인정보·설정): 설정은 기사 자기 것, 개인정보 이름·연락처는 기사 본인,
  // 사업자 정보·정산 계좌는 차주가 입력한 값(화면에선 보기만, 저장 때 기사 행에 안 씀).
  const selfSettings = selfProfileRes.data?.settings
  const nextSettings = normalizeSettings(selfSettings && typeof selfSettings === 'object' && !Array.isArray(selfSettings) ? selfSettings : {})
  const nextProfile = {
    name: selfProfileRes.data?.name || '',
    phone: selfProfileRes.data?.phone || '',
    bizName: ownerInfo?.business_name || '',
    bizRepresentative: ownerInfo?.business_representative || '',
    bizNumber: ownerInfo?.business_number || '',
    bizAddress: ownerInfo?.business_address || '',
    bizType: ownerInfo?.business_type || '',
    bizItem: ownerInfo?.business_item || '',
    bizEmail: ownerInfo?.business_email || '',
    bankName: ownerInfo?.bank_name || '',
    accountNumber: ownerInfo?.account_number || '',
    accountHolder: ownerInfo?.account_holder || '',
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

  const assignedVehicleNumber = String(nextCars[0]?.number || '').trim()
  /** @type {Array<import('./hydrateMergeTypes.js').ClientRow>} */
  let clientRows = []
  if (assignedVehicleNumber) {
    const clientsRes = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', ownerKey)
      .eq('raw->>scopedToVehicleNumber', assignedVehicleNumber)
      .order('display_order', { ascending: true })
    throwIfAnyHydrateError({ clients: clientsRes.error })
    clientRows = /** @type {Array<import('./hydrateMergeTypes.js').ClientRow>} */ (clientsRes.data || [])
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

  /** @type {Array<import('../domain/clientTypes.js').ClientLike>} */
  let nextClients = []
  nextClients = reconcileClients(ownerKey, mergeClientsFromRows(nextClients, clientRows))

  return {
    workData: workLogs.main || {},
    workLogs,
    cars: nextCars,
    clients: nextClients,
    drivers: nextDrivers,
    profile: nextProfile,
    settings: nextSettings,
    expenses: nextExpenses,
    invoices: [],
  }
}
