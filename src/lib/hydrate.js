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
  findMainCar,
  mergeWorkDataFromRows,
  mergeExpenseKind,
} from './hydrateMerge.js'
import { expenseFromFuelRecord, replaceFuelExpenses } from '../domain/fuelRecords.js'
import { expenseFromMaintenanceRecord, replaceMaintExpenses } from '../domain/maintenanceRecords.js'
import { expenseFromMiscRecord, replaceMiscExpenses } from '../domain/miscExpenseRecords.js'
import { mergeTaxInvoiceRecords } from '../domain/taxInvoices.js'

/** @param {string} userId @param {string} ownerKey */
export function hydrateFromSupabase(userId, ownerKey) {
  return singleFlight(`hydrate:${ownerKey}`, () => {
    const myEpoch = beginSessionEpoch(userId, ownerKey)
    return performHydrate(userId, ownerKey, myEpoch)
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

/** @param {string} userId @param {string} ownerKey @param {number} myEpoch */
async function performHydrate(userId, ownerKey, myEpoch) {
  setHydration({ status: 'hydrating', userId, ownerKey, epoch: myEpoch })

  try {
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

    const mainCar = findMainCar(nextCars)
    if (mainCar?.supabaseId) {
      const [dailyRes, transportRes, fuelRes, maintRes, miscRes] = await Promise.all([
        supabase.from('daily_logs').select('*').eq('vehicle_id', mainCar.supabaseId),
        supabase.from('transport_details').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('fuel_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('maintenance_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('misc_expense_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
      ])
      throwIfAnyHydrateError({
        daily_logs: dailyRes.error, transport_details: transportRes.error, fuel_records: fuelRes.error,
        maintenance_records: maintRes.error, misc_expense_records: miscRes.error,
      })

      // 재감사 3차(FAIL 지적 1번) — 아직 서버에 삭제를 못 알린 날짜(tombstone)는
      // 이 hydrate가 방금 받은 서버 rows로도 절대 되살아나지 않는다.
      // 슬라이스 D: null을 []로 위장하지 않는다 — 조회 실패는 위에서 이미 throw했고,
      // mergeWorkDataFromRows가 Array.isArray로만 "서버 정본" 여부를 가린다.
      nextWorkData = mergeWorkDataFromRows(nextWorkData, {
        dailyRows: dailyRes.data, transportRows: transportRes.data || [], fuelRows: fuelRes.data || [], maintRows: maintRes.data || [], miscRows: miscRes.data || [],
      }, Object.keys(readOwnerWorkDataTombstones(ownerKey)))
      nextExpenses = mergeExpenseKind({ kind: 'fuel', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: fuelRes.data || [], mapRow: expenseFromFuelRecord, replace: replaceFuelExpenses })
      nextExpenses = mergeExpenseKind({ kind: 'maint', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: maintRes.data || [], mapRow: expenseFromMaintenanceRecord, replace: replaceMaintExpenses })
      nextExpenses = mergeExpenseKind({ kind: 'misc', currentExpenses: nextExpenses, snapshotExpenses: [], previousExpenses: [], rows: miscRes.data || [], mapRow: expenseFromMiscRecord, replace: replaceMiscExpenses })
    }

    const taxInvoicesRes = await supabase.from('tax_invoices').select('*').eq('user_id', userId)
    throwIfAnyHydrateError({ tax_invoices: taxInvoicesRes.error })
    nextInvoices = mergeTaxInvoiceRecords(nextInvoices, taxInvoicesRes.data || [])

    const nextSnapshot = {
      workData: nextWorkData, cars: nextCars, clients: nextClients, drivers: nextDrivers,
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
  return hydrateFromSupabase(userId, ownerKey)
}
