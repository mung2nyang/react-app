// @ts-check
// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — hydrate 전체. all-or-nothing 조회
// 판정(2차) + dirty journal 재적용(2차) + single-flight/세대 보호(2차, cloudSession.js로
// 이전) + outbox tombstone/pending 재적용(4차, 신규)까지 전부 여기서 합친다.
import { supabase } from '../supabaseClient.js'
import { setHydration } from '../store/app-store.js'
import { replaceOwnerState } from '../store/owner-state.js'
import { getDirtyDomains, hasDirty } from './dirtyJournal.js'
import { readOwnerWorkDataTombstones } from '../store/ownerDataHooks.js'
import { singleFlight } from './singleFlight.js'
import { beginSessionEpoch, getCloudOwnerKey, getCloudUserId, getSessionEpoch, isSessionStillCurrent } from './cloudSession.js'
import { collectPracticeSnapshot } from './cloudStorage.js'
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
import { scheduleCloudSync } from './syncQueue.js'

/** @typedef {import('../store/app-store.js').DomainValue} DomainValue */

/** @param {string} userId @param {string} ownerKey */
export function hydrateFromSupabase(userId, ownerKey) {
  return singleFlight(`hydrate:${ownerKey}`, () => {
    const myEpoch = beginSessionEpoch(userId, ownerKey)
    return performHydrate(userId, ownerKey, myEpoch)
  })
}

/** @param {string} userId @param {string} ownerKey @param {number} myEpoch */
async function performHydrate(userId, ownerKey, myEpoch) {
  setHydration({ status: 'hydrating', userId, ownerKey })

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

    const localSnapshot = collectPracticeSnapshot(ownerKey)
    const settingsJson = (profileRes.data?.settings && typeof profileRes.data.settings === 'object') ? profileRes.data.settings : {}
    const profileSnapshot = settingsJson.practiceSnapshot || {}

    let nextWorkData = (profileSnapshot.workData && typeof profileSnapshot.workData === 'object') ? profileSnapshot.workData : localSnapshot.workData
    let nextCars = Array.isArray(profileSnapshot.cars) ? profileSnapshot.cars : localSnapshot.cars
    let nextClients = Array.isArray(profileSnapshot.clients) ? profileSnapshot.clients : localSnapshot.clients
    let nextDrivers = Array.isArray(profileSnapshot.drivers) ? profileSnapshot.drivers : localSnapshot.drivers
    const nextSettings = (profileSnapshot.settings && typeof profileSnapshot.settings === 'object') ? profileSnapshot.settings : localSnapshot.settings
    let nextExpenses = Array.isArray(profileSnapshot.expenses) ? profileSnapshot.expenses : localSnapshot.expenses
    let nextInvoices = Array.isArray(profileSnapshot.invoices) ? profileSnapshot.invoices : localSnapshot.invoices

    const nextProfile = mergeProfileRow(localSnapshot.profile, profileRes.data)
    nextCars = reconcileCars(ownerKey, mergeCarsFromRows(nextCars, vehiclesRes.data || []))
    nextClients = reconcileClients(ownerKey, mergeClientsFromRows(nextClients, clientsRes.data || []))
    nextDrivers = reconcileDrivers(ownerKey, mergeDriversFromRows(nextDrivers, nextCars, linksRes.data || []), localSnapshot.drivers)

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
      nextWorkData = mergeWorkDataFromRows(nextWorkData, {
        dailyRows: dailyRes.data || [], transportRows: transportRes.data || [], fuelRows: fuelRes.data || [], maintRows: maintRes.data || [], miscRows: miscRes.data || [],
      }, Object.keys(readOwnerWorkDataTombstones(ownerKey)))
      nextExpenses = mergeExpenseKind({ kind: 'fuel', currentExpenses: nextExpenses, snapshotExpenses: profileSnapshot.expenses, previousExpenses: localSnapshot.expenses, rows: fuelRes.data || [], mapRow: expenseFromFuelRecord, replace: replaceFuelExpenses })
      nextExpenses = mergeExpenseKind({ kind: 'maint', currentExpenses: nextExpenses, snapshotExpenses: profileSnapshot.expenses, previousExpenses: localSnapshot.expenses, rows: maintRes.data || [], mapRow: expenseFromMaintenanceRecord, replace: replaceMaintExpenses })
      nextExpenses = mergeExpenseKind({ kind: 'misc', currentExpenses: nextExpenses, snapshotExpenses: profileSnapshot.expenses, previousExpenses: localSnapshot.expenses, rows: miscRes.data || [], mapRow: expenseFromMiscRecord, replace: replaceMiscExpenses })
    }

    const taxInvoicesRes = await supabase.from('tax_invoices').select('*').eq('user_id', userId)
    throwIfAnyHydrateError({ tax_invoices: taxInvoicesRes.error })
    nextInvoices = mergeTaxInvoiceRecords(nextInvoices, taxInvoicesRes.data || [])

    const nextSnapshot = {
      workData: nextWorkData, cars: nextCars, clients: nextClients, drivers: nextDrivers,
      profile: nextProfile, settings: nextSettings, expenses: nextExpenses, invoices: nextInvoices,
    }

    const dirtyDomains = getDirtyDomains(ownerKey)
    if (dirtyDomains.length) {
      const freshLocal = collectPracticeSnapshot(ownerKey)
      // getDirtyDomains는 string[]이라(domain/dirtyJournal.js가 실제로 어떤 도메인이
      // 아직 안 지워졌는지 문자열로 기록·조회한다), nextSnapshot/freshLocal의 8개
      // 구체 필드 중 어느 것인지 TS가 정적으로 못 좁힌다 — 8개 필드가 실제로 전부
      // app-store.js의 DomainValue(object 또는 문자열/객체 배열)와 같은 모양이므로,
      // 그 정확한 타입의 레코드로 단언해서 동적 키 접근을 허용한다(any/unknown 아님).
      const snapshotAsRecord = /** @type {Record<string, DomainValue>} */ (nextSnapshot)
      const freshLocalAsRecord = /** @type {Record<string, DomainValue>} */ (freshLocal)
      dirtyDomains.forEach((domain) => {
        if (domain in snapshotAsRecord) snapshotAsRecord[domain] = freshLocalAsRecord[domain]
      })
    }

    if (!isSessionStillCurrent({ userId, ownerKey, epoch: myEpoch })) return nextSnapshot // 더 최신 세션이 이미 있다 — 조용히 버린다.

    replaceOwnerState(ownerKey, nextSnapshot, { sync: false })
    setHydration({ status: 'ready', userId, ownerKey })
    if (hasDirty(ownerKey)) scheduleCloudSync()
    if (hasPendingOps(ownerKey)) flushMutationOutbox(ownerKey).catch((error) => console.error('outbox 플러시 실패:', error))
    return nextSnapshot
  } catch (error) {
    if (getSessionEpoch() === myEpoch) setHydration({ status: 'failed', userId, ownerKey })
    throw error
  }
}

export async function retryHydrate() {
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!userId || !ownerKey) return undefined
  return hydrateFromSupabase(userId, ownerKey)
}
