import { supabase } from '../supabaseClient.js'
import { getState, setHydration } from '../store/app-store.js'
import { replaceOwnerState } from '../store/owner-state.js'
import { getDirtyDomains, hasDirty, clearDirty } from './dirtyJournal.js'
import { singleFlight } from './singleFlight.js'
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
import {
  buildFuelRecordRow,
  expenseFromFuelRecord,
  groupFuelExpensesByDate,
  replaceFuelExpenses,
} from '../domain/fuelRecords.js'
import {
  buildMaintenanceRecordRow,
  expenseFromMaintenanceRecord,
  groupMaintExpensesByDate,
  replaceMaintExpenses,
} from '../domain/maintenanceRecords.js'
import {
  buildMiscExpenseRecordRow,
  expenseFromMiscRecord,
  groupMiscExpensesByDate,
  replaceMiscExpenses,
} from '../domain/miscExpenseRecords.js'
import {
  applyInsertedTaxInvoiceId,
  buildTaxInvoiceRow,
  mergeTaxInvoiceRecords,
  matchTaxInvoiceClientId,
  resolveTaxInvoiceVehicleId,
  TAX_INVOICE_VEHICLE_RETRY_ERROR,
} from '../domain/taxInvoices.js'

const KEYS = {
  work: 'reactPracticeWorkData',
  cars: 'reactPracticeCars',
  clients: 'reactPracticeClients',
  drivers: 'reactPracticeDrivers',
  profile: 'reactPracticeProfile',
  settings: 'reactPracticeSettings',
  expenses: 'reactPracticeExpenses',
  invoices: 'reactPracticeInvoices',
}

let cloudUserId = null
let cloudOwnerKey = null
let syncTimer = null
// hydrateFromSupabase 호출마다 올라가는 세대 카운터. owner가 바뀌는 순간(로그아웃 후
// 다른 계정으로 재로그인 등) 이전 owner의 hydrate가 늦게 끝나더라도 "내가 시작했을 때
// 최신이었던 세대"와 다르면 결과를 버린다 — 늦게 도착한 이전 요청이 최신 상태를 덮어
// 쓰는 사고를 막는다.
let hydrateGeneration = 0

// Step 0-4 감사 보완: syncing boolean 하나로는 "지금 도는 동기화가 끝나면 한 번 더 돌아야
// 하는지"를 표현할 수 없었다(끝나기 전에 들어온 변경은 새 600ms 타이머로만 재예약됐고,
// pagehide처럼 타이머가 살아남지 못하는 상황에서는 그 변경이 그냥 유실됐다). runningPromise +
// dirty로 바꿔서 flushCloudSync가 "지금 도는 것"과 "그 사이 생긴 추가 변경"을 전부 기다린
// 뒤에만 resolve하게 한다. hydrate가 idle/hydrating/failed라 원격 쓰기가 막혀 있는 동안의
// 변경은 (2차 감사 보완) 이 메모리 전용 플래그가 아니라 dirtyJournal.js의 durable
// per-owner 저널이 담당한다 — 새로고침해도 "아직 서버에 못 보낸 게 있다"는 사실이
// 남는다. hydrate가 ready가 되면 hasDirty()로 확인해 자동으로 한 번 플러시한다.
const syncQueue = {
  runningPromise: null,
  dirty: false,
}

function readJson(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value))
}

function keyFor(prefix, ownerKey) {
  return `${prefix}:${ownerKey}`
}

function parseEntityNumber(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function rangesOverlap(startA, endA, startB, endB) {
  const aEnd = endA || '9999-12-31'
  const bEnd = endB || '9999-12-31'
  return startA <= bEnd && startB <= aEnd
}

export function isCloudSession(session) {
  return !!(session?.userId && !session.guestMode)
}

export function collectPracticeSnapshot(ownerKey) {
  return {
    workData: readJson(keyFor(KEYS.work, ownerKey), {}),
    cars: readJson(keyFor(KEYS.cars, ownerKey), []),
    clients: readJson(keyFor(KEYS.clients, ownerKey), []),
    drivers: readJson(keyFor(KEYS.drivers, ownerKey), []),
    profile: readJson(keyFor(KEYS.profile, ownerKey), {}),
    settings: readJson(keyFor(KEYS.settings, ownerKey), {}),
    expenses: readJson(keyFor(KEYS.expenses, ownerKey), []),
    invoices: readJson(keyFor(KEYS.invoices, ownerKey), []),
  }
}

function practiceSnapshotForProfile(snapshot) {
  const { invoices: _invoices, expenses, ...rest } = snapshot
  return {
    ...rest,
    expenses: (expenses || []).filter((item) => item.kind !== 'fuel' && item.kind !== 'maint' && item.kind !== 'misc'),
  }
}

export function applyPracticeSnapshot(ownerKey, snapshot = {}) {
  if (snapshot.workData && typeof snapshot.workData === 'object') writeJson(keyFor(KEYS.work, ownerKey), snapshot.workData)
  if (Array.isArray(snapshot.cars)) writeJson(keyFor(KEYS.cars, ownerKey), snapshot.cars)
  if (Array.isArray(snapshot.clients)) writeJson(keyFor(KEYS.clients, ownerKey), snapshot.clients)
  if (Array.isArray(snapshot.drivers)) writeJson(keyFor(KEYS.drivers, ownerKey), snapshot.drivers)
  if (snapshot.profile && typeof snapshot.profile === 'object') writeJson(keyFor(KEYS.profile, ownerKey), snapshot.profile)
  if (snapshot.settings && typeof snapshot.settings === 'object') writeJson(keyFor(KEYS.settings, ownerKey), snapshot.settings)
  if (Array.isArray(snapshot.expenses)) writeJson(keyFor(KEYS.expenses, ownerKey), snapshot.expenses)
  if (Array.isArray(snapshot.invoices)) writeJson(keyFor(KEYS.invoices, ownerKey), snapshot.invoices)
}

export function buildVehicleRow(userId, car, index) {
  const logId = car.type === 'sub' ? car.number : 'main'
  return {
    user_id: userId,
    legacy_log_id: logId,
    number: car.number || '',
    type: car.type === 'sub' ? 'sub' : 'main',
    tonnage: car.tonnage || '',
    display_order: index,
    comm_enabled: !!car.commEnabled,
    comm_type: car.commType || null,
    comm_value: car.commission != null ? String(car.commission) : null,
    settlement_mode: car.settlementMode || null,
    driver_link_id: car.driverLinkId || null,
    driver_name: car.driverName || null,
    archived: !!car.archived,
    raw: car,
  }
}

export function buildClientRow(userId, client, index) {
  return {
    user_id: userId,
    legacy_client_id: client.id || null,
    company_name: client.companyName,
    manager_name: client.managerName || null,
    biz_number: client.bizNumber || null,
    phone: client.phone || null,
    tax_invoice_enabled: !!client.taxInvoiceEnabled,
    is_pinned: !!client.isPinned,
    comm_enabled: !!client.commEnabled,
    comm_type: client.commType || null,
    comm_value: client.commValue != null ? String(client.commValue) : null,
    payment_term: client.paymentTerm || null,
    payment_term_value: client.paymentTermValue || null,
    display_order: index,
    raw: client,
  }
}

export function endCloudSession() {
  cloudUserId = null
  cloudOwnerKey = null
  if (syncTimer) clearTimeout(syncTimer)
  syncQueue.dirty = false
  // 로그아웃/게스트는 기다릴 hydrate가 없으므로 'idle' — UI 잠금은 'hydrating'일 때만
  // 걸리므로 idle도 failed와 마찬가지로 잠금 해제 상태다.
  setHydration({ status: 'idle', userId: null, ownerKey: null })
}

function isHydrationReady() {
  return getState().hydration.status === 'ready'
}

/**
 * Step 0-4 감사 보완 2차: queueSync/scheduleCloudSync 큐를 거치지 않고 UI에서 직접
 * 부르는 Supabase mutation(차량/거래처 삭제, 기사 링크 CRUD)이 공통으로 거치는 관문.
 * hydrate가 ready가 아니면(아직 안 됐거나 실패했으면) 던진다 — 호출부는 이미 모두
 * .catch()로 실패를 잡아 토스트만 띄우고 로컬 상태는 그대로 두므로, 여기서 던지는 것만
 * 으로 안전하게 "서버가 아직 준비 안 됐을 때는 아예 쏘지 않는다"를 보장할 수 있다.
 * durable retry(재시도 큐에 넣고 나중에 자동 재전송)는 이 라운드 범위 밖이다 — 실패하면
 * 사용자가 다시 시도해야 한다는 걸 감사 보고서에 명시한다.
 */
export function assertCloudWriteReady() {
  if (!cloudUserId || !cloudOwnerKey) throw new Error('로그인이 필요합니다.')
  if (!isHydrationReady()) throw new Error('클라우드 동기화가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.')
}

/**
 * runningPromise가 있으면 그 실행에 "한 번 더 돌아야 한다"는 표시(dirty)만 남기고 그
 * 실행을 그대로 돌려준다 — flushCloudSync가 pagehide에서 이 Promise를 await하면
 * "지금 도는 것 + 그 사이 생긴 변경"까지 다 반영된 뒤에야 resolve된다. 원본 코드는
 * 이 경우 scheduleCloudSync()로 새 600ms 타이머만 잡았는데, pagehide 중에는 그 타이머가
 * 살아남지 못해 변경이 유실될 수 있었다.
 * @param {string} userId
 * @param {string} ownerKey
 * @returns {Promise<void>}
 */
function queueSync(userId, ownerKey) {
  if (syncQueue.runningPromise) {
    syncQueue.dirty = true
    return syncQueue.runningPromise
  }
  syncQueue.runningPromise = (async () => {
    try {
      do {
        syncQueue.dirty = false
        await syncAll(userId, ownerKey)
      } while (syncQueue.dirty)
      // 여기 도달했다는 건 마지막 syncAll이 성공했고 그 사이 새 dirty도 안 생겼다는
      // 뜻이다 — 지금 로컬은 서버와 같으므로 저널을 비운다. 실패했으면 위 await가
      // 던지고 여기 도달하지 않으므로 저널은 그대로 남는다(다음 재시도 대상).
      clearDirty(ownerKey)
    } finally {
      syncQueue.runningPromise = null
    }
  })()
  return syncQueue.runningPromise
}

export function scheduleCloudSync() {
  if (!isHydrationReady() || !cloudUserId || !cloudOwnerKey) {
    // hydrate가 idle/hydrating/failed인 동안의 변경은 서버로 보내지 않는다. 이 변경은
    // 이미 호출부(app-store.js의 commitBatch)가 dirtyJournal.markDirty()로 durable하게
    // 남겨 놨으므로 여기서 더 할 일이 없다 — hydrate가 (재시도로) ready가 되면
    // hasDirty()를 보고 자동으로 한 번 플러시한다.
    return
  }
  if (syncQueue.runningPromise) {
    syncQueue.dirty = true
    return
  }
  if (syncTimer) clearTimeout(syncTimer)
  const userId = cloudUserId
  const ownerKey = cloudOwnerKey
  syncTimer = setTimeout(() => {
    syncTimer = null
    queueSync(userId, ownerKey).catch((error) => console.error('클라우드 동기화 실패:', error))
  }, 600)
}

/**
 * Step 0-4 감사 보완 2차 — hydrate 전체 재작성.
 *
 * 이전 구현은 profiles/vehicles/clients/driver_links, daily_logs/transport_details/
 * fuel/maintenance/misc 각 조회 실패를 console.warn으로 "부드럽게" 넘기고 나머지는
 * 계속 진행했다. 특히 transport_details 조회가 실패해도 daily_logs만 성공하면
 * callDetails: []로 매일 기록을 만들어 로컬의 실제 콜상세를 지워 버리는 사고가 있었다
 * (감사 지적 2번). 이번 재작성은:
 *   1) 필요한 조회를 전부 마친 뒤 error를 한꺼번에 판정한다 — 하나라도 실패하면
 *      즉시 던지고, 그때까지 아무 것도 localStorage/store에 쓰지 않는다(all-or-nothing).
 *   2) 병합은 전부 메모리에서(hydrateMerge.js) 계산하고, 성공했을 때만 마지막에
 *      replaceOwnerState() 한 번으로 커밋한다.
 *   3) 커밋 직전, 이 owner에 아직 서버로 못 보낸 로컬 변경(dirtyJournal)이 있는 도메인은
 *      방금 받은 서버 값 대신 "지금 이 순간의" 로컬 값을 그대로 남긴다 — 실패 후 편집 →
 *      재시도 흐름에서 로컬 편집이 유실되지 않는다(감사 지적 5번).
 *   4) owner별 single-flight + 전역 세대 카운터로 StrictMode 중복 호출/오래된 요청의
 *      결과가 최신 상태를 덮어쓰는 사고를 막는다(감사 지적 8번).
 * @param {string} userId
 * @param {string} ownerKey
 * @returns {Promise<object>}
 */
export function hydrateFromSupabase(userId, ownerKey) {
  cloudUserId = userId
  cloudOwnerKey = ownerKey
  return singleFlight(`hydrate:${ownerKey}`, () => {
    hydrateGeneration += 1
    return performHydrate(userId, ownerKey, hydrateGeneration)
  })
}

async function performHydrate(userId, ownerKey, myGeneration) {
  // 스토어 hydration 상태를 'hydrating'으로 켠다. PersonalInfoPage/AppSettingsPage가
  // useHydrationLock()으로 구독해서 이 구간에는 입력을 막는다 (Step 2). 아래 catch가
  // 실패를 'failed'로 남기고, 성공(ready)/실패(failed) 양쪽 다 status를 정확히 남긴다.
  setHydration({ status: 'hydrating', userId, ownerKey })

  try {
    const [profileRes, vehiclesRes, clientsRes, linksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('vehicles').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      supabase.from('clients').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      supabase.from('driver_links').select('*').eq('owner_id', userId),
    ])
    throwIfAnyHydrateError({
      profiles: profileRes.error,
      vehicles: vehiclesRes.error,
      clients: clientsRes.error,
      driver_links: linksRes.error,
    })

    const localSnapshot = collectPracticeSnapshot(ownerKey)
    const settingsJson = (profileRes.data?.settings && typeof profileRes.data.settings === 'object') ? profileRes.data.settings : {}
    const profileSnapshot = settingsJson.practiceSnapshot || {}

    // applyPracticeSnapshot이 하던 "프로필에 백업된 스냅샷을 기본값으로 깔아 준다" 역할을
    // 메모리에서 재현한다 — 이후 각 도메인 전용 테이블 병합이 있으면 이 값을 덮어쓴다.
    let nextWorkData = (profileSnapshot.workData && typeof profileSnapshot.workData === 'object') ? profileSnapshot.workData : localSnapshot.workData
    let nextCars = Array.isArray(profileSnapshot.cars) ? profileSnapshot.cars : localSnapshot.cars
    let nextClients = Array.isArray(profileSnapshot.clients) ? profileSnapshot.clients : localSnapshot.clients
    let nextDrivers = Array.isArray(profileSnapshot.drivers) ? profileSnapshot.drivers : localSnapshot.drivers
    const nextSettings = (profileSnapshot.settings && typeof profileSnapshot.settings === 'object') ? profileSnapshot.settings : localSnapshot.settings
    let nextExpenses = Array.isArray(profileSnapshot.expenses) ? profileSnapshot.expenses : localSnapshot.expenses
    let nextInvoices = Array.isArray(profileSnapshot.invoices) ? profileSnapshot.invoices : localSnapshot.invoices

    const nextProfile = mergeProfileRow(localSnapshot.profile, profileRes.data)
    nextCars = mergeCarsFromRows(nextCars, vehiclesRes.data)
    nextClients = mergeClientsFromRows(nextClients, clientsRes.data)
    nextDrivers = mergeDriversFromRows(nextDrivers, nextCars, linksRes.data)

    const mainCar = findMainCar(nextCars)
    if (mainCar?.supabaseId) {
      const [dailyRes, transportRes, fuelRes, maintRes, miscRes] = await Promise.all([
        supabase.from('daily_logs').select('*').eq('vehicle_id', mainCar.supabaseId),
        supabase.from('transport_details').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('fuel_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('maintenance_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
        supabase.from('misc_expense_records').select('*').eq('vehicle_id', mainCar.supabaseId).order('sequence', { ascending: true }),
      ])
      // transport_details 실패를 반드시 검사한다 — 이걸 빼먹은 게 콜상세를 지우던
      // 원래 버그였다(감사 지적 2번). 5개 중 하나라도 실패하면 workData/expenses를
      // 아예 다시 만들지 않고 전체 hydrate를 실패시킨다.
      throwIfAnyHydrateError({
        daily_logs: dailyRes.error,
        transport_details: transportRes.error,
        fuel_records: fuelRes.error,
        maintenance_records: maintRes.error,
        misc_expense_records: miscRes.error,
      })

      nextWorkData = mergeWorkDataFromRows(nextWorkData, {
        dailyRows: dailyRes.data,
        transportRows: transportRes.data,
        fuelRows: fuelRes.data,
        maintRows: maintRes.data,
        miscRows: miscRes.data,
      })

      nextExpenses = mergeExpenseKind({
        kind: 'fuel',
        currentExpenses: nextExpenses,
        snapshotExpenses: profileSnapshot.expenses,
        previousExpenses: localSnapshot.expenses,
        rows: fuelRes.data,
        mapRow: expenseFromFuelRecord,
        replace: replaceFuelExpenses,
      })
      nextExpenses = mergeExpenseKind({
        kind: 'maint',
        currentExpenses: nextExpenses,
        snapshotExpenses: profileSnapshot.expenses,
        previousExpenses: localSnapshot.expenses,
        rows: maintRes.data,
        mapRow: expenseFromMaintenanceRecord,
        replace: replaceMaintExpenses,
      })
      nextExpenses = mergeExpenseKind({
        kind: 'misc',
        currentExpenses: nextExpenses,
        snapshotExpenses: profileSnapshot.expenses,
        previousExpenses: localSnapshot.expenses,
        rows: miscRes.data,
        mapRow: expenseFromMiscRecord,
        replace: replaceMiscExpenses,
      })
    }

    const taxInvoicesRes = await supabase.from('tax_invoices').select('*').eq('user_id', userId)
    throwIfAnyHydrateError({ tax_invoices: taxInvoicesRes.error })
    nextInvoices = mergeTaxInvoiceRecords(nextInvoices, taxInvoicesRes.data || [])

    const nextSnapshot = {
      workData: nextWorkData,
      cars: nextCars,
      clients: nextClients,
      drivers: nextDrivers,
      profile: nextProfile,
      settings: nextSettings,
      expenses: nextExpenses,
      invoices: nextInvoices,
    }

    // 감사 지적 5번: 지금 이 owner에 아직 서버로 못 보낸 로컬 변경이 남아 있는 도메인은
    // 방금 받은 서버 값으로 덮지 않는다 — hydrate 도중/실패 후 재시도 사이에 들어온
    // 로컬 편집을 보호한다. "지금 이 순간의" 로컬 값을 다시 읽어서 쓴다(위 fetch가 도는
    // 동안 편집이 더 있었을 수 있으므로 localSnapshot이 아니라 새로 읽는다).
    const dirtyDomains = getDirtyDomains(ownerKey)
    if (dirtyDomains.length) {
      const freshLocal = collectPracticeSnapshot(ownerKey)
      dirtyDomains.forEach((domain) => {
        if (domain in nextSnapshot) nextSnapshot[domain] = freshLocal[domain]
      })
    }

    if (myGeneration !== hydrateGeneration) return nextSnapshot // 더 최신 hydrate가 이미 있다 — 조용히 버린다.

    // sync:false가 핵심이다: 방금 서버에서 받아온 걸 그대로 다시 서버로 올리는 핑퐁을
    // 막는다. replaceOwnerState가 localStorage 쓰기 + state 갱신 + notify(1회)를
    // 원자적으로 처리한다.
    replaceOwnerState(ownerKey, nextSnapshot, { sync: false })
    setHydration({ status: 'ready', userId, ownerKey })
    if (hasDirty(ownerKey)) scheduleCloudSync()
    return nextSnapshot
  } catch (error) {
    if (myGeneration === hydrateGeneration) setHydration({ status: 'failed', userId, ownerKey })
    throw error
  }
}

/**
 * 실패한 hydrate를 명시적으로 다시 시도한다. cloudUserId/cloudOwnerKey가 없으면(로그인
 * 상태가 아니면) 아무것도 하지 않는다 — 재시도 대상 자체가 없다. 같은 owner의 hydrate가
 * 이미 도는 중이면(singleFlight) 새로 쏘지 않고 그 결과를 그대로 기다린다.
 * @returns {Promise<object|undefined>}
 */
export async function retryHydrate() {
  if (!cloudUserId || !cloudOwnerKey) return undefined
  return hydrateFromSupabase(cloudUserId, cloudOwnerKey)
}

async function syncVehicles(userId, ownerKey) {
  const cars = readJson(keyFor(KEYS.cars, ownerKey), [])
  const next = [...cars]
  for (let index = 0; index < next.length; index += 1) {
    const car = next[index]
    const row = buildVehicleRow(userId, car, index)
    if (car.supabaseId) {
      const { error } = await supabase.from('vehicles').update(row).eq('id', car.supabaseId)
      if (error) throw error
      continue
    }
    const { data: existingRows, error: lookupError } = await supabase.from('vehicles')
      .select('id')
      .eq('user_id', userId)
      .eq('legacy_log_id', row.legacy_log_id)
    if (lookupError) throw lookupError
    const existingId = existingRows?.[0]?.id
    if (existingId) {
      const { error } = await supabase.from('vehicles').update(row).eq('id', existingId)
      if (error) throw error
      next[index] = { ...car, supabaseId: existingId }
    } else {
      const { data, error } = await supabase.from('vehicles').insert(row).select('id').single()
      if (error) throw error
      next[index] = { ...car, supabaseId: data.id }
    }
  }
  writeJson(keyFor(KEYS.cars, ownerKey), next)
  return next
}

async function syncClients(userId, ownerKey) {
  const clients = readJson(keyFor(KEYS.clients, ownerKey), [])
  const next = [...clients]
  for (let index = 0; index < next.length; index += 1) {
    const client = next[index]
    const row = buildClientRow(userId, client, index)
    if (client.supabaseId) {
      const { error } = await supabase.from('clients').update(row).eq('id', client.supabaseId)
      if (error) throw error
      continue
    }
    const { data, error } = await supabase.from('clients').insert(row).select('id').single()
    if (error) throw error
    next[index] = { ...client, supabaseId: data.id }
  }
  writeJson(keyFor(KEYS.clients, ownerKey), next)
  return next
}

async function syncWorkData(userId, ownerKey, cars, clients) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const workData = readJson(keyFor(KEYS.work, ownerKey), {})
  const clientIdByName = new Map((clients || []).filter((item) => item.supabaseId).map((item) => [item.companyName, item.supabaseId]))
  for (const [workDate, record] of Object.entries(workData || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !record || typeof record !== 'object') continue
    const callDetails = Array.isArray(record.callDetails) ? record.callDetails : []
    const { callDetails: _callDetails, fuelItems: _fuelItems, maintItems: _maintItems, miscItems: _miscItems, ...dailyFields } = record
    const { data, error } = await supabase.from('daily_logs').upsert({
      user_id: userId,
      vehicle_id: mainCar.supabaseId,
      work_date: workDate,
      is_off: !!record.isOff,
      fixed_count: parseEntityNumber(record.fixedCount),
      pallet_count: parseEntityNumber(record.palletCount),
      raw: dailyFields,
    }, { onConflict: 'vehicle_id,work_date' }).select('id').single()
    if (error) throw error
    await supabase.from('transport_details').delete().eq('daily_log_id', data.id)
    if (callDetails.length) {
      const { error: detailError } = await supabase.from('transport_details').insert(callDetails.map((detail, index) => ({
        daily_log_id: data.id,
        user_id: userId,
        vehicle_id: mainCar.supabaseId,
        client_id: clientIdByName.get(detail?.client) || null,
        work_date: workDate,
        sequence: index,
        load_loc: detail?.loadLoc || null,
        unload_loc: detail?.unloadLoc || null,
        fare_amount: parseEntityNumber(detail?.fare),
        vat_exempt: !!detail?.vatExempt,
        payment_status: detail?.paymentStatus || '미수',
        payment_due_date: detail?.paymentDueDate || null,
        payments: Array.isArray(detail?.payments) ? detail.payments : [],
        commission_snapshot: detail?.commissionSnapshot || null,
        raw: detail,
      })))
      if (detailError) throw detailError
    }
  }
}

async function upsertDailyLog(userId, vehicleId, workDate, record) {
  const safeRecord = record && typeof record === 'object' ? record : { isOff: false, fixedCount: 0 }
  const { callDetails: _callDetails, fuelItems: _fuelItems, maintItems: _maintItems, miscItems: _miscItems, ...dailyFields } = safeRecord
  const { data, error } = await supabase.from('daily_logs').upsert({
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    is_off: !!safeRecord.isOff,
    fixed_count: parseEntityNumber(safeRecord.fixedCount),
    pallet_count: parseEntityNumber(safeRecord.palletCount),
    raw: dailyFields,
  }, { onConflict: 'vehicle_id,work_date' }).select('id').single()
  if (error) throw error
  return data.id
}

async function syncFuelRecords(userId, ownerKey, cars) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const expenses = readJson(keyFor(KEYS.expenses, ownerKey), [])
  const workData = readJson(keyFor(KEYS.work, ownerKey), {})
  const fuelByDate = groupFuelExpensesByDate(expenses)
  const dates = new Set([...Object.keys(workData || {}), ...Object.keys(fuelByDate)])
  const { data: logs, error: logsError } = await supabase
    .from('daily_logs')
    .select('id, work_date')
    .eq('vehicle_id', mainCar.supabaseId)
  if (logsError) throw logsError
  const idByDate = new Map((logs || []).map((row) => [row.work_date, row.id]))

  for (const workDate of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue
    const fuelItems = fuelByDate[workDate] || []
    const record = workData[workDate]
    if (!record && !fuelItems.length) continue
    let dailyLogId = idByDate.get(workDate)
    if (!dailyLogId) {
      if (!fuelItems.length) continue
      dailyLogId = await upsertDailyLog(userId, mainCar.supabaseId, workDate, record)
      idByDate.set(workDate, dailyLogId)
    }
    const { error: deleteError } = await supabase.from('fuel_records').delete().eq('daily_log_id', dailyLogId)
    if (deleteError) throw deleteError
    if (!fuelItems.length) continue
    const { error: insertError } = await supabase.from('fuel_records').insert(fuelItems.map((item, index) => buildFuelRecordRow(item, index, {
      dailyLogId,
      userId,
      vehicleId: mainCar.supabaseId,
      workDate,
    })))
    if (insertError) throw insertError
  }
}

async function syncMaintenanceRecords(userId, ownerKey, cars) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const expenses = readJson(keyFor(KEYS.expenses, ownerKey), [])
  const workData = readJson(keyFor(KEYS.work, ownerKey), {})
  const maintByDate = groupMaintExpensesByDate(expenses)
  const dates = new Set([...Object.keys(workData || {}), ...Object.keys(maintByDate)])
  const { data: logs, error: logsError } = await supabase
    .from('daily_logs')
    .select('id, work_date')
    .eq('vehicle_id', mainCar.supabaseId)
  if (logsError) throw logsError
  const idByDate = new Map((logs || []).map((row) => [row.work_date, row.id]))

  for (const workDate of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue
    const maintItems = maintByDate[workDate] || []
    const record = workData[workDate]
    if (!record && !maintItems.length) continue
    let dailyLogId = idByDate.get(workDate)
    if (!dailyLogId) {
      if (!maintItems.length) continue
      dailyLogId = await upsertDailyLog(userId, mainCar.supabaseId, workDate, record)
      idByDate.set(workDate, dailyLogId)
    }
    const { error: deleteError } = await supabase.from('maintenance_records').delete().eq('daily_log_id', dailyLogId)
    if (deleteError) throw deleteError
    if (!maintItems.length) continue
    const { error: insertError } = await supabase.from('maintenance_records').insert(maintItems.map((item, index) => buildMaintenanceRecordRow(item, index, {
      dailyLogId,
      userId,
      vehicleId: mainCar.supabaseId,
      workDate,
    })))
    if (insertError) throw insertError
  }
}

async function syncMiscExpenseRecords(userId, ownerKey, cars) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const expenses = readJson(keyFor(KEYS.expenses, ownerKey), [])
  const workData = readJson(keyFor(KEYS.work, ownerKey), {})
  const miscByDate = groupMiscExpensesByDate(expenses)
  const dates = new Set([...Object.keys(workData || {}), ...Object.keys(miscByDate)])
  const { data: logs, error: logsError } = await supabase
    .from('daily_logs')
    .select('id, work_date')
    .eq('vehicle_id', mainCar.supabaseId)
  if (logsError) throw logsError
  const idByDate = new Map((logs || []).map((row) => [row.work_date, row.id]))

  for (const workDate of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue
    const miscItems = miscByDate[workDate] || []
    const record = workData[workDate]
    if (!record && !miscItems.length) continue
    let dailyLogId = idByDate.get(workDate)
    if (!dailyLogId) {
      if (!miscItems.length) continue
      dailyLogId = await upsertDailyLog(userId, mainCar.supabaseId, workDate, record)
      idByDate.set(workDate, dailyLogId)
    }
    const { error: deleteError } = await supabase.from('misc_expense_records').delete().eq('daily_log_id', dailyLogId)
    if (deleteError) throw deleteError
    if (!miscItems.length) continue
    const { error: insertError } = await supabase.from('misc_expense_records').insert(miscItems.map((item, index) => buildMiscExpenseRecordRow(item, index, {
      dailyLogId,
      userId,
      vehicleId: mainCar.supabaseId,
      workDate,
    })))
    if (insertError) throw insertError
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function resolveTaxInvoiceVehicleIdWithRetry(item, ownerKey) {
  let vehicleId = resolveTaxInvoiceVehicleId(item, { cars: readJson(keyFor(KEYS.cars, ownerKey), []) })
  for (let attempt = 0; !vehicleId && attempt < 5; attempt += 1) {
    await wait(500)
    vehicleId = resolveTaxInvoiceVehicleId(item, { cars: readJson(keyFor(KEYS.cars, ownerKey), []) })
  }
  return vehicleId
}

async function syncTaxInvoices(userId, ownerKey, cars, clients) {
  const invoices = readJson(keyFor(KEYS.invoices, ownerKey), [])
  if (!invoices.length) return
  const latestCars = cars || readJson(keyFor(KEYS.cars, ownerKey), [])
  const latestClients = clients || readJson(keyFor(KEYS.clients, ownerKey), [])
  let next = [...invoices]

  for (let index = 0; index < next.length; index += 1) {
    const item = next[index]
    let vehicleId = resolveTaxInvoiceVehicleId(item, { cars: latestCars })
    if (!vehicleId) vehicleId = await resolveTaxInvoiceVehicleIdWithRetry(item, ownerKey)
    if (!vehicleId) throw new Error(TAX_INVOICE_VEHICLE_RETRY_ERROR)

    const row = buildTaxInvoiceRow(item, {
      userId,
      vehicleId,
      clientId: matchTaxInvoiceClientId(item, latestClients),
    })

    if (item.supabaseId) {
      const { error } = await supabase.from('tax_invoices').update(row).eq('id', item.supabaseId)
      if (error) throw error
      continue
    }

    const { data, error } = await supabase.from('tax_invoices').insert(row).select('id').single()
    if (error) throw error
    next = applyInsertedTaxInvoiceId(next, item.id, data.id)
    writeJson(keyFor(KEYS.invoices, ownerKey), next)
  }
}

// 동시 실행 방지는 queueSync()의 runningPromise 게이트가 전담한다(이 함수를 직접 부르는
// 곳은 queueSync 하나뿐이라 여기서 또 막을 필요가 없다 — Step 0-4 감사 보완으로 정리).
async function syncAll(userId, ownerKey) {
  const snapshot = collectPracticeSnapshot(ownerKey)
  const profile = snapshot.profile || {}
  const settings = snapshot.settings || {}
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    name: profile.name || null,
    phone: profile.phone || null,
    business_name: profile.bizName || null,
    business_number: profile.bizNumber || null,
    business_address: profile.bizAddress || null,
    business_type: profile.bizType || null,
    business_item: profile.bizItem || null,
    business_email: profile.bizEmail || null,
    bank_name: profile.bankName || null,
    account_number: profile.accountNumber || null,
    settings: {
      ...settings,
      practiceSnapshot: practiceSnapshotForProfile(snapshot),
    },
    updated_at: new Date().toISOString(),
  })
  if (profileError) throw profileError

  const cars = await syncVehicles(userId, ownerKey)
  const clients = await syncClients(userId, ownerKey)
  await syncWorkData(userId, ownerKey, cars, clients)
  await syncFuelRecords(userId, ownerKey, cars)
  await syncMaintenanceRecords(userId, ownerKey, cars)
  await syncMiscExpenseRecords(userId, ownerKey, cars)
  await syncTaxInvoices(userId, ownerKey, cars, clients)
}

export async function deleteVehicleFromSupabase(vehicleSupabaseId) {
  if (!vehicleSupabaseId) return
  assertCloudWriteReady()
  const childResults = await Promise.all([
    supabase.from('transport_details').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('maintenance_records').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('fuel_records').delete().eq('vehicle_id', vehicleSupabaseId),
    supabase.from('misc_expense_records').delete().eq('vehicle_id', vehicleSupabaseId),
  ])
  const childError = childResults.find((result) => result.error)?.error
  if (childError) throw childError
  const { error: dailyLogsError } = await supabase.from('daily_logs').delete().eq('vehicle_id', vehicleSupabaseId)
  if (dailyLogsError) throw dailyLogsError
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleSupabaseId)
  if (error) throw error
}

export async function deleteClientFromSupabase(clientSupabaseId) {
  if (!clientSupabaseId) return
  assertCloudWriteReady()
  const unlinkResults = await Promise.all([
    supabase.from('transport_details').update({ client_id: null }).eq('client_id', clientSupabaseId),
    supabase.from('tax_invoices').update({ client_id: null }).eq('client_id', clientSupabaseId),
  ])
  const unlinkError = unlinkResults.find((result) => result.error)?.error
  if (unlinkError) throw unlinkError
  const { error } = await supabase.from('clients').delete().eq('id', clientSupabaseId)
  if (error) throw error
}

export async function findOverlappingDriverLinkOnSupabase(vehicleId, start, end, excludeSupabaseId) {
  assertCloudWriteReady()
  const { data, error } = await supabase
    .from('driver_links')
    .select('id, assignment_start, assignment_end, status, driver_id')
    .eq('vehicle_id', vehicleId)
    .neq('status', 'disconnected')
  if (error) throw error
  return (data || []).find((row) => {
    if (excludeSupabaseId && row.id === excludeSupabaseId) return false
    if (!row.assignment_start) return false
    return rangesOverlap(start, end || '', row.assignment_start, row.assignment_end || '')
  }) || null
}

export async function upsertDriverLinkOnSupabase({ supabaseId, vehicleId, inviteCode, assignmentStart, assignmentEnd }) {
  assertCloudWriteReady()
  const baseRow = {
    owner_id: cloudUserId,
    vehicle_id: vehicleId,
    assignment_start: assignmentStart,
    assignment_end: assignmentEnd || null,
    updated_at: new Date().toISOString(),
  }
  if (supabaseId) {
    const { data, error } = await supabase.from('driver_links').update({ ...baseRow, invite_code: inviteCode }).eq('id', supabaseId).select().single()
    if (error) throw error
    return data
  }
  let code = inviteCode
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase.from('driver_links').insert({ ...baseRow, invite_code: code, status: 'pending' }).select().single()
    if (!error) return data
    if (error.code === '23505') {
      lastError = error
      code = String(Math.floor(100000 + Math.random() * 900000))
      continue
    }
    throw error
  }
  throw lastError || new Error('초대 코드 생성에 반복적으로 실패했습니다.')
}

export async function updateDriverLinkStatusOnSupabase(supabaseId, status) {
  if (!supabaseId) return
  assertCloudWriteReady()
  const { error } = await supabase.from('driver_links').update({ status, updated_at: new Date().toISOString() }).eq('id', supabaseId)
  if (error) throw error
}

export async function deleteDriverLinkOnSupabase(supabaseId) {
  if (!supabaseId) return
  assertCloudWriteReady()
  const { error } = await supabase.from('driver_links').delete().eq('id', supabaseId)
  if (error) throw error
}

export async function saveDriverInviteToCloud(items, editingId, cars) {
  // 게스트/비로그인은 클라우드 자체가 없다 — 에러가 아니라 "조용히 건너뛴다"가 맞는
  // 기존 동작이라 그대로 둔다. 로그인은 했는데 hydrate가 준비 안 된 경우만
  // assertCloudWriteReady()가 던져서 호출부(.catch)가 토스트로 알려 준다.
  if (!cloudUserId || !cloudOwnerKey) return { items }
  assertCloudWriteReady()
  await syncVehicles(cloudUserId, cloudOwnerKey)
  const latestCars = readJson(keyFor(KEYS.cars, cloudOwnerKey), cars)
  const idx = items.findIndex((item) => item.id === editingId) >= 0
    ? items.findIndex((item) => item.id === editingId)
    : items.length - 1
  const driver = items[idx]
  if (!driver?.vehicleNumber || !driver.startDate) return { items }

  const car = latestCars.find((item) => item.number === driver.vehicleNumber)
  if (!car?.supabaseId) {
    return { error: '선택한 차량이 아직 클라우드에 동기화되지 않았습니다. 잠시 후 다시 시도해 주세요.', items }
  }

  const editing = items.find((item) => item.id === editingId)
  const serverConflict = await findOverlappingDriverLinkOnSupabase(car.supabaseId, driver.startDate, driver.endDate, editing?.supabaseId)
  if (serverConflict) {
    return { error: '같은 차량에 이미 겹치는 기간으로 연결되어 있거나 초대된 기록이 있습니다.', items }
  }

  const savedRow = await upsertDriverLinkOnSupabase({
    supabaseId: driver.supabaseId || null,
    vehicleId: car.supabaseId,
    inviteCode: driver.inviteCode,
    assignmentStart: driver.startDate,
    assignmentEnd: driver.endDate,
  })
  const next = [...items]
  next[idx] = {
    ...driver,
    supabaseId: savedRow.id,
    inviteCode: savedRow.invite_code,
    startDate: savedRow.assignment_start || driver.startDate,
    endDate: savedRow.assignment_end || driver.endDate || '',
    status: savedRow.status === 'linked' ? 'linked' : driver.status,
  }
  return { items: next }
}

/**
 * pagehide/visibilitychange/online에서 부른다. 이미 도는 동기화가 있으면 그 실행이
 * "이번에 필요한 내용까지" 반영하고 끝날 때까지 기다린다(queueSync의 dirty 재실행) —
 * 600ms 디바운스 타이머를 새로 잡고 빠져나가지 않는다. pagehide 중에는 그 타이머가
 * 살아남는다는 보장이 없기 때문이다.
 */
export async function flushCloudSync() {
  if (!isHydrationReady() || !cloudUserId || !cloudOwnerKey) return
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
  await queueSync(cloudUserId, cloudOwnerKey)
}
