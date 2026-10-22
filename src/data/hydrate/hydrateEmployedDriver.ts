// employed_driver hydrate — profiles/vehicles 행 대신 RPC, 거래처는 배정 차량 스코프만, 세금계산서는 건너뜀(최소 권한), 비용은 배정 차량 기준.
// 기사 일지는 workLogs.main만 쓰므로 번호판 키를 main으로 옮긴다. TODO(multi-vehicle): 배정 차량 2대+면 지금은 cars[0]만 쓴다.
import { expenseFromFuelRecord, replaceFuelExpenses } from '../../domain/fuelRecords.ts'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../../domain/maintenanceRecords.ts'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../../domain/miscExpenseRecords.ts'
import { normalizeSettings } from '../../domain/practiceSettings.ts'
import {
  fetchAssignedVehicleSummary,
  fetchLinkedOwnerBusinessInfo,
} from '../sync/driverLinkRpc.ts'
import { carFromAssignedSummary } from './hydrateEmployedDriverCar.ts'
import { mergeClientsFromRows, mergeDriversFromRows, mergeExpenseKind } from './hydrateMerge.ts'
import { logIdForCar, mergeVehicleDayLogsFromServer } from './hydrateVehicleDayLogs.ts'
import { supabase } from '../cloud/supabaseClient.ts'
import { fetchAllRows } from '../cloud/fetchAllRows.ts'
import type { ClientRow, JsonRecord, LocalCar, SupabaseQueryError } from './hydrateMergeTypes.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { ExpenseItem } from '../../domain/expenseTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'

export { carFromAssignedSummary }

/**
 * 배정차 서버 일지(번호판 키) → workLogs.main. 번호판 키는 남기지 않는다.
 * cars 가 비면 { main: {} }. logIdForCar(undefined) 호출 없음.
 */
export function remapEmployedDriverWorkLogs(workLogs: Record<string, Record<string, DayRecordLike>> | null | undefined, cars: Array<CarLike | LocalCar> | null | undefined): { main: Record<string, DayRecordLike> } {
  const list = Array.isArray(cars) ? cars : []
  if (list.length === 0) return { main: {} }

  const primary = list[0]
  const plateKey = logIdForCar((primary) as CarLike)
  if (!plateKey || plateKey === 'main') {
    return { main: (workLogs && workLogs.main) ? workLogs.main : {} }
  }
  const plateData = workLogs && workLogs[plateKey] ? workLogs[plateKey] : {}
  return { main: plateData }
}

/** hydrate.ts:138-153 과 동일 — mergeExpenseKind / expenseFrom*Record 재사용. */
async function fetchExpensesForAssignedVehicle(vehicleId: string | number, throwIfAnyHydrateError: (labeled: Record<string, SupabaseQueryError>) => void): Promise<Array<ExpenseItem>> {
  const [fuelRes, maintRes, miscRes] = await Promise.all([
    fetchAllRows(() => supabase.from('fuel_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id')),
    fetchAllRows(() => supabase.from('maintenance_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id')),
    fetchAllRows(() => supabase.from('misc_expense_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id')),
  ])
  throwIfAnyHydrateError({
    fuel_records: fuelRes.error,
    maintenance_records: maintRes.error,
    misc_expense_records: miscRes.error,
  })
  let nextExpenses: Array<JsonRecord> = []
  nextExpenses = mergeExpenseKind({ kind: 'fuel', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: fuelRes.data || [], mapRow: expenseFromFuelRecord, replace: replaceFuelExpenses })
  nextExpenses = mergeExpenseKind({ kind: 'maint', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: maintRes.data || [], mapRow: expenseFromMaintenanceRecord, replace: replaceMaintExpenses })
  nextExpenses = mergeExpenseKind({ kind: 'misc', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: miscRes.data || [], mapRow: expenseFromMiscRecord, replace: replaceMiscExpenses })
  // 차주가 넣은 항목의 차량 표시를 떼어 기사 본인 목록·매출에 포함한다.
  return (nextExpenses.map(({ vehicleNumber: _vehicleNumber, ...item }) => item)) as Array<ExpenseItem>
}

export async function buildEmployedDriverSnapshot({
  userId, ownerKey, throwIfAnyHydrateError, driverPhone, localDrivers,
}: {
  userId: string,
  ownerKey: string,
  throwIfAnyHydrateError: (labeled: Record<string, SupabaseQueryError>) => void,
  driverPhone?: string | null | undefined,
  localDrivers: Array<DriverRecord>,
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
  const nextCars: Array<LocalCar> = (vehicleRows || []).map((row) => carFromAssignedSummary(row))
  let nextDrivers = (
    mergeDriversFromRows(localDrivers, nextCars, linksRes.data || [])
  ) as Array<DriverRecord>
  const phone = String(driverPhone || selfProfileRes.data?.phone || '').trim()
  if (phone) {
    nextDrivers = nextDrivers.map((driver) => (
      driver.status === 'linked' && !driver.phone ? { ...driver, phone } : driver
    ))
  }

  const assignedVehicleNumber = String(nextCars[0]?.number || '').trim()
  let clientRows: Array<ClientRow> = []
  if (assignedVehicleNumber) {
    const clientsRes = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', ownerKey)
      .eq('raw->>scopedToVehicleNumber', assignedVehicleNumber)
      .order('display_order', { ascending: true })
    throwIfAnyHydrateError({ clients: clientsRes.error })
    clientRows = (clientsRes.data || []) as Array<ClientRow>
  }

  const { workLogs: rawWorkLogs } = await mergeVehicleDayLogsFromServer({
    cars: nextCars,
    mainTombstoneKeys: [],
    fetchDaily: (vehicleId) => fetchAllRows(() => supabase.from('daily_logs').select('*').eq('vehicle_id', vehicleId).order('id')),
    fetchTransport: (vehicleId) => fetchAllRows(() => supabase
      .from('transport_details')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('sequence', { ascending: true })
      .order('id')),
    throwIfAnyHydrateError,
  })
  const workLogs = remapEmployedDriverWorkLogs(rawWorkLogs, nextCars)

  const assignedVehicleId = nextCars[0]?.supabaseId
  const nextExpenses = assignedVehicleId != null
    ? await fetchExpensesForAssignedVehicle(assignedVehicleId, throwIfAnyHydrateError)
    : []

  const nextClients: Array<ClientLike> = mergeClientsFromRows([], clientRows)

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
