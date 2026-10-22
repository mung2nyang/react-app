// hydrate 전체 — 조회 전부 성공 판정, single-flight/세대 보호.
import { supabase } from '../cloud/supabaseClient.ts'
import { getState, setHydration } from '../store/app-store.ts'
import { replaceOwnerState } from '../store/owner-state.ts'
import { readOwnerWorkDataTombstones } from '../store/ownerDataHooks.ts'
import { singleFlight } from '../cloud/singleFlight.ts'
import { beginSessionEpoch, getCloudOwnerKey, getCloudUserId, isSessionStillCurrent } from '../cloud/cloudSession.ts'
import { normalizeSettings } from '../../domain/practiceSettings.ts'
import { readPersistDomain } from '../store/persistDomainRead.ts'
import {
  throwIfAnyHydrateError,
  mergeProfileRow,
  mergeCarsFromRows,
  mergeClientsFromRows,
  mergeDriversFromRows,
  mergeExpenseKind,
} from './hydrateMerge.ts'
import { mergeVehicleDayLogsFromServer } from './hydrateVehicleDayLogs.ts'
import { expenseFromFuelRecord, replaceFuelExpenses } from '../../domain/fuelRecords.ts'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../../domain/maintenanceRecords.ts'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../../domain/miscExpenseRecords.ts'
import { mergeTaxInvoiceRecords } from '../../domain/taxInvoices.ts'
import { buildEmployedDriverSnapshot } from './hydrateEmployedDriver.ts'
import { fetchOwnerDriverExpenses } from './hydrateOwnerDriverExpenses.ts'
import { fetchOwnerDriverLinks } from '../sync/driverUnlink.ts'
import { fetchAllRows } from '../cloud/fetchAllRows.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'
import type { JsonRecord } from './hydrateMergeTypes.ts'
import type { InvoiceLike } from '../../domain/financeTaxInvoiceEntries.ts'
import type { ExpenseItem } from '../../domain/expenseTypes.ts'

export function hydrateFromSupabase(userId: string, ownerKey: string, options: { employedDriver?: boolean } = {}) {
  return singleFlight(`hydrate:${ownerKey}`, () => {
    const myEpoch = beginSessionEpoch(userId, ownerKey)
    return performHydrate(userId, ownerKey, myEpoch, options)
  })
}

/**
 * 이 세대가 hydration 슬롯을 아직 쥐고 있을 때만 ready/failed로 닫는다.
 * 로그아웃(idle)이나 더 새 hydrate가 epoch를 갈아탄 뒤에는 덮지 않는다.
 */
function finishHydration(myEpoch: number, patch: { status: 'ready' | 'failed', userId: string, ownerKey: string }) {
  if (getState().hydration.epoch !== myEpoch) return
  setHydration({ ...patch, epoch: myEpoch })
}

/** settings LS에서 theme만 읽는다. 파싱 실패를 light로 오인하지 않는다. */
function localThemeIfReadable(ownerKey: string) {
  const read = readPersistDomain('settings', ownerKey)
  if (!read.ok || !read.value || typeof read.value !== 'object' || Array.isArray(read.value)) return null
  if (!('theme' in read.value)) return null
  if (read.value.theme === 'dark' || read.value.theme === 'light') return read.value.theme
  return null
}

async function performHydrate(userId: string, ownerKey: string, myEpoch: number, options: { employedDriver?: boolean } = {}) {
  setHydration({ status: 'hydrating', userId, ownerKey, epoch: myEpoch })

  try {
    // employed_driver: profiles/vehicles 행 SELECT 금지 — 호출부가 linkedOwnerId일 때만 켠다.
    // (테스트는 userId≠ownerKey로 격리하므로 그 비교로 판별하면 안 된다.)
    if (options.employedDriver) {
      const nextSnapshot = await buildEmployedDriverSnapshot({
        userId,
        ownerKey,
        throwIfAnyHydrateError,
        localDrivers: getState().drivers[ownerKey] || [],
      })
      if (isSessionStillCurrent({ userId, ownerKey, epoch: myEpoch })) {
        // driverExpenses는 차주 hydrate 전용 — 소속기사 세션에서는 빈 배열로 replace(스테일 제거).
        replaceOwnerState(ownerKey, { ...nextSnapshot, driverExpenses: [] }, { persist: false })
        finishHydration(myEpoch, { status: 'ready', userId, ownerKey })
        dropLegacyKeys(ownerKey)
      } else {
        finishHydration(myEpoch, { status: 'ready', userId, ownerKey })
      }
      return nextSnapshot
    }

    const [profileRes, vehiclesRes, clientsRes, linksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('vehicles').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      supabase.from('clients').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      fetchOwnerDriverLinks(userId),
    ])
    throwIfAnyHydrateError({
      profiles: profileRes.error, vehicles: vehiclesRes.error, clients: clientsRes.error, driver_links: linksRes.error,
    })

    const settingsJson = (profileRes.data?.settings && typeof profileRes.data.settings === 'object') ? profileRes.data.settings : {}
    const lsTheme = localThemeIfReadable(ownerKey)
    const serverSettings = (settingsJson && typeof settingsJson === 'object') ? settingsJson : {}

    let nextWorkData: Record<string, DayRecordLike> = {}
    let nextWorkLogs: Record<string, Record<string, DayRecordLike>> = { main: {} }
    let nextCars: Array<CarLike> = []
    let nextClients: Array<ClientLike> = []
    let nextDrivers = ([]) as Array<DriverRecord>
    const restSettings = { ...serverSettings }
    delete restSettings.practiceSnapshot
    const nextSettings = normalizeSettings({
      ...restSettings,
      theme: (restSettings.theme === 'dark' || restSettings.theme === 'light') ? restSettings.theme : (lsTheme || 'light'),
    })
    let nextExpenses = ([]) as Array<JsonRecord>
    let nextInvoices = ([]) as Array<InvoiceLike>

    const nextProfile = mergeProfileRow({}, profileRes.data)
    nextCars = mergeCarsFromRows(nextCars, vehiclesRes.data || [])
    nextClients = mergeClientsFromRows(nextClients, clientsRes.data || [])
    nextDrivers = mergeDriversFromRows(getState().drivers[ownerKey] || [], nextCars, linksRes.data || [])

    // supabaseId 있는 전 차량(main+기사) daily_logs/transport 병합.
    // tombstone은 메인만 적용(서브는 서버 직접 저장이라 tombstone을 쓰지 않는다).
    const mainTombstoneKeys = Object.keys(readOwnerWorkDataTombstones(ownerKey))
    const { workLogs, mainCar } = await mergeVehicleDayLogsFromServer({
      cars: nextCars,
      mainTombstoneKeys,
      fetchDaily: (vehicleId) => fetchAllRows(() => supabase.from('daily_logs').select('*').eq('vehicle_id', vehicleId).order('id')),
      fetchTransport: (vehicleId) => fetchAllRows(() => supabase.from('transport_details').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id')),
      throwIfAnyHydrateError,
    })
    nextWorkLogs = workLogs
    nextWorkData = workLogs.main || {}

    if (mainCar?.supabaseId) {
      const [fuelRes, maintRes, miscRes] = await Promise.all([
        fetchAllRows(() => supabase.from('fuel_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }).order('id')),
        fetchAllRows(() => supabase.from('maintenance_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }).order('id')),
        fetchAllRows(() => supabase.from('misc_expense_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }).order('id')),
      ])
      throwIfAnyHydrateError({
        fuel_records: fuelRes.error,
        maintenance_records: maintRes.error,
        misc_expense_records: miscRes.error,
      })

      nextExpenses = mergeExpenseKind({ kind: 'fuel', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: fuelRes.data || [], mapRow: expenseFromFuelRecord, replace: replaceFuelExpenses })
      nextExpenses = mergeExpenseKind({ kind: 'maint', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: maintRes.data || [], mapRow: expenseFromMaintenanceRecord, replace: replaceMaintExpenses })
      nextExpenses = mergeExpenseKind({ kind: 'misc', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: miscRes.data || [], mapRow: expenseFromMiscRecord, replace: replaceMiscExpenses })
    }

    const { expenses: ownerExpenses, driverExpenses: nextDriverExpenses } = await fetchOwnerDriverExpenses(nextCars, nextDrivers, nextExpenses, throwIfAnyHydrateError)

    const taxInvoicesRes = await fetchAllRows(() => supabase.from('tax_invoices').select('*').eq('user_id', userId).order('id'))
    throwIfAnyHydrateError({ tax_invoices: taxInvoicesRes.error })
    nextInvoices = mergeTaxInvoiceRecords(nextInvoices, taxInvoicesRes.data || [])

    const nextSnapshot = {
      workData: nextWorkData, workLogs: nextWorkLogs, cars: nextCars, clients: nextClients, drivers: nextDrivers,
      profile: nextProfile, settings: nextSettings,
      expenses: (ownerExpenses) as ExpenseItem[],
      driverExpenses: nextDriverExpenses,
      invoices: nextInvoices,
    }

    if (isSessionStillCurrent({ userId, ownerKey, epoch: myEpoch })) {
      replaceOwnerState(ownerKey, nextSnapshot, { persist: false })
      finishHydration(myEpoch, { status: 'ready', userId, ownerKey })
      dropLegacyKeys(ownerKey)
    } else {
      // 스냅샷은 반영하지 않는다. 이 세대가 아직 hydrating이면 스위치를 닫아 영원히 잠기지 않게 한다.
      finishHydration(myEpoch, { status: 'ready', userId, ownerKey })
    }
    return nextSnapshot
  } catch (error) {
    finishHydration(myEpoch, { status: 'failed', userId, ownerKey })
    throw error
  } finally {
    if (getState().hydration.epoch === myEpoch && getState().hydration.status === 'hydrating') {
      finishHydration(myEpoch, { status: 'failed', userId, ownerKey })
    }
  }
}

// 옛 보낼 편지함·변경 기록장 키는 보내지 않고 지운다 — 더 쓰지 않음(로드맵 88·89).
function dropLegacyKeys(ownerKey: string) {
  try {
    localStorage.removeItem(`reactPracticeMutationOutbox:${ownerKey}`)
    localStorage.removeItem(`reactPracticeDirtyJournal:${ownerKey}`)
  } catch { /* 저장소를 못 쓰면 그대로 둠 */ }
}

export async function retryHydrate() {
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!userId || !ownerKey) return undefined
  const { fetchLinkedDriverLink } = await import('../sync/driverLinkRpc.ts')
  const link = await fetchLinkedDriverLink(userId)
  const employedDriver = !!(link?.owner_id && String(link.owner_id) === String(ownerKey))
  return hydrateFromSupabase(userId, ownerKey, { employedDriver })
}
