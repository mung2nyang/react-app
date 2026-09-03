// @ts-check
// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — hydrate 전체. all-or-nothing 조회
// 판정(2차) + dirty journal 재적용(2차) + single-flight/세대 보호(2차, cloudSession.js로
// 이전) + outbox tombstone/pending 재적용(4차, 신규)까지 전부 여기서 합친다.
import { supabase } from '../supabaseClient.js'
import { getState, setHydration } from '../store/app-store.js'
import { replaceOwnerState } from '../store/owner-state.js'
import { clearDirty } from './dirtyJournal.js'
import { readOwnerWorkDataTombstones } from '../store/ownerDataHooks.js'
import { singleFlight } from './singleFlight.js'
import { beginSessionEpoch, getCloudOwnerKey, getCloudUserId, isSessionStillCurrent } from './cloudSession.js'
import { normalizeSettings } from '../domain/practiceSettings.js'
import { readPersistDomain } from '../store/persistDomainRead.js'
import { hasPendingOps } from './mutationOutbox.js'
import { flushMutationOutbox } from './outboxFlush.js'
import { reconcileCars, reconcileClients, reconcileDrivers } from './outboxReconcile.js'
import {
  throwIfAnyHydrateError,
  mergeProfileRow,
  mergeCarsFromRows,
  mergeClientsFromRows,
  mergeDriversFromRows,
  mergeExpenseKind,
} from './hydrateMerge.js'
import { mergeVehicleDayLogsFromServer } from './hydrateVehicleDayLogs.js'
import { expenseFromFuelRecord, replaceFuelExpenses } from '../domain/fuelRecords.js'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../domain/maintenanceRecords.js'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../domain/miscExpenseRecords.js'
import { mergeTaxInvoiceRecords } from '../domain/taxInvoices.js'
import { buildEmployedDriverSnapshot } from './hydrateEmployedDriver.js'

/** @param {string} userId @param {string} ownerKey @param {{ employedDriver?: boolean }} [options] */
export function hydrateFromSupabase(userId, ownerKey, options = {}) {
  return singleFlight(`hydrate:${ownerKey}`, () => {
    const myEpoch = beginSessionEpoch(userId, ownerKey)
    return performHydrate(userId, ownerKey, myEpoch, options)
  })
}

/**
 * 이 세대가 hydration 슬롯을 아직 쥐고 있을 때만 ready/failed로 닫는다.
 * 로그아웃(idle)이나 더 새 hydrate가 epoch를 갈아탄 뒤에는 덮지 않는다.
 * @param {number} myEpoch
 * @param {{ status: 'ready'|'failed', userId: string, ownerKey: string }} patch
 */
function finishHydration(myEpoch, patch) {
  if (getState().hydration.epoch !== myEpoch) return
  setHydration({ ...patch, epoch: myEpoch })
}

/** settings LS에서 theme만 읽는다. 파싱 실패를 light로 오인하지 않는다. @param {string} ownerKey */
function localThemeIfReadable(ownerKey) {
  const read = readPersistDomain('settings', ownerKey)
  if (!read.ok || !read.value || typeof read.value !== 'object' || Array.isArray(read.value)) return null
  if (!('theme' in read.value)) return null
  if (read.value.theme === 'dark' || read.value.theme === 'light') return read.value.theme
  return null
}

/** @param {string} userId @param {string} ownerKey @param {number} myEpoch @param {{ employedDriver?: boolean }} [options] */
async function performHydrate(userId, ownerKey, myEpoch, options = {}) {
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
      clearDirty(ownerKey)
      if (isSessionStillCurrent({ userId, ownerKey, epoch: myEpoch })) {
        replaceOwnerState(ownerKey, nextSnapshot, { sync: false, persist: false })
        finishHydration(myEpoch, { status: 'ready', userId, ownerKey })
        if (hasPendingOps(ownerKey)) {
          flushMutationOutbox(ownerKey).catch((error) => console.error('outbox 플러시 실패:', error))
        }
      } else {
        finishHydration(myEpoch, { status: 'ready', userId, ownerKey })
      }
      return nextSnapshot
    }

    const [profileRes, vehiclesRes, clientsRes, linksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('vehicles').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      supabase.from('clients').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      supabase.from('driver_links').select('*').eq('owner_id', userId),
    ])
    throwIfAnyHydrateError({
      profiles: profileRes.error, vehicles: vehiclesRes.error, clients: clientsRes.error, driver_links: linksRes.error,
    })

    const settingsJson = (profileRes.data?.settings && typeof profileRes.data.settings === 'object') ? profileRes.data.settings : {}
    const lsTheme = localThemeIfReadable(ownerKey)
    const serverSettings = (settingsJson && typeof settingsJson === 'object') ? settingsJson : {}

    /** @type {Record<string, import('../domain/dayRecordTypes.js').DayRecordLike>} */
    let nextWorkData = {}
    /** @type {Record<string, Record<string, import('../domain/dayRecordTypes.js').DayRecordLike>>} */
    let nextWorkLogs = { main: {} }
    /** @type {Array<import('../domain/financeTypes.js').CarLike>} */
    let nextCars = []
    /** @type {Array<import('../domain/clientTypes.js').ClientLike>} */
    let nextClients = []
    let nextDrivers = /** @type {Array<import('./outboxTypes.js').DriverRecord>} */ ([])
    const restSettings = { ...serverSettings }
    delete restSettings.practiceSnapshot
    const nextSettings = normalizeSettings({
      ...restSettings,
      theme: (restSettings.theme === 'dark' || restSettings.theme === 'light') ? restSettings.theme : (lsTheme || 'light'),
    })
    let nextExpenses = /** @type {Array<import('./hydrateMergeTypes.js').JsonRecord>} */ ([])
    let nextInvoices = /** @type {Array<import('../domain/financeTaxInvoiceEntries.js').InvoiceLike>} */ ([])

    const nextProfile = mergeProfileRow({}, profileRes.data)
    nextCars = reconcileCars(ownerKey, mergeCarsFromRows(nextCars, vehiclesRes.data || []))
    nextClients = reconcileClients(ownerKey, mergeClientsFromRows(nextClients, clientsRes.data || []))
    const localDrivers = getState().drivers[ownerKey] || []
    nextDrivers = reconcileDrivers(ownerKey, mergeDriversFromRows(localDrivers, nextCars, linksRes.data || []), localDrivers)

    // Step 9 슬라이스 A: supabaseId 있는 전 차량(main+기사) daily_logs/transport 병합.
    // 메인 tombstone만 적용(서브는 Fail-Fast라 tombstone 미사용 — 착수지시 확인 1·2).
    const mainTombstoneKeys = Object.keys(readOwnerWorkDataTombstones(ownerKey))
    const { workLogs, mainCar } = await mergeVehicleDayLogsFromServer({
      cars: nextCars,
      mainTombstoneKeys,
      fetchDaily: (vehicleId) => supabase.from('daily_logs').select('*').eq('vehicle_id', vehicleId),
      fetchTransport: (vehicleId) => supabase.from('transport_details').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
      throwIfAnyHydrateError,
    })
    nextWorkLogs = workLogs
    nextWorkData = workLogs.main || {}

    if (mainCar?.supabaseId) {
      const [fuelRes, maintRes, miscRes] = await Promise.all([
        supabase.from('fuel_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('maintenance_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('misc_expense_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
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

    const taxInvoicesRes = await supabase.from('tax_invoices').select('*').eq('user_id', userId)
    throwIfAnyHydrateError({ tax_invoices: taxInvoicesRes.error })
    nextInvoices = mergeTaxInvoiceRecords(nextInvoices, taxInvoicesRes.data || [])

    const nextSnapshot = {
      workData: nextWorkData, workLogs: nextWorkLogs, cars: nextCars, clients: nextClients, drivers: nextDrivers,
      profile: nextProfile, settings: nextSettings,
      expenses: /** @type {import('../domain/expenseTypes.js').ExpenseItem[]} */ (nextExpenses), invoices: nextInvoices,
    }

    clearDirty(ownerKey)
    if (isSessionStillCurrent({ userId, ownerKey, epoch: myEpoch })) {
      replaceOwnerState(ownerKey, nextSnapshot, { sync: false, persist: false })
      finishHydration(myEpoch, { status: 'ready', userId, ownerKey })
      if (hasPendingOps(ownerKey)) flushMutationOutbox(ownerKey).catch((error) => console.error('outbox 플러시 실패:', error))
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

export async function retryHydrate() {
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!userId || !ownerKey) return undefined
  const { fetchLinkedDriverLink } = await import('./driverLinkRpc.js')
  const link = await fetchLinkedDriverLink(userId)
  const employedDriver = !!(link?.owner_id && String(link.owner_id) === String(ownerKey))
  return hydrateFromSupabase(userId, ownerKey, { employedDriver })
}
