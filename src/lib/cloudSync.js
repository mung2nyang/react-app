import { supabase } from '../supabaseClient.js'
import { setHydration } from '../store/app-store.js'
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
let hydrationCompleted = false
let syncTimer = null
let syncing = false

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
  hydrationCompleted = false
  if (syncTimer) clearTimeout(syncTimer)
  // 스토어 쪽 hydration lock은 "완료돼서 잠금 해제" 의미로 true를 쓴다 — 로그아웃/게스트는
  // 애초에 기다릴 hydrate가 없으므로 잠글 이유가 없다 (Step 2, migration-audit-plan.md).
  setHydration({ completed: true, userId: null, ownerKey: null })
}

export function scheduleCloudSync() {
  if (!hydrationCompleted || !cloudUserId || !cloudOwnerKey) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncAll(cloudUserId, cloudOwnerKey).catch((error) => console.error('클라우드 동기화 실패:', error))
  }, 600)
}

export async function hydrateFromSupabase(userId, ownerKey) {
  cloudUserId = userId
  cloudOwnerKey = ownerKey
  hydrationCompleted = false
  // 스토어 hydration lock을 켠다. PersonalInfoPage/AppSettingsPage가 useHydrationLock()으로
  // 구독해서 이 구간에는 입력을 막는다 (Step 2). 아래 try/finally가 성공/실패 어느 쪽이든
  // 끝나면 잠금을 반드시 풀도록 보장한다 — 잠긴 채로 남는 것이 무한 lock보다 나쁘다.
  setHydration({ completed: false, userId, ownerKey })

  try {
    const [{ data: profile, error: profileError }, { data: vehicles, error: vehiclesError }, { data: clientsRows, error: clientsError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('vehicles').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      supabase.from('clients').select('*').eq('user_id', userId).order('display_order', { ascending: true }),
      supabase.from('driver_links').select('*').eq('owner_id', userId),
    ])

    if (profileError) console.warn('[Supabase] profiles 조회 실패, 로컬을 유지합니다.', profileError)
    const settingsJson = (!profileError && profile?.settings && typeof profile.settings === 'object') ? profile.settings : {}
    const snapshot = settingsJson.practiceSnapshot || {}
    const previousExpenses = readJson(keyFor(KEYS.expenses, ownerKey), [])
    applyPracticeSnapshot(ownerKey, snapshot)

    const localProfile = readJson(keyFor(KEYS.profile, ownerKey), {})
    writeJson(keyFor(KEYS.profile, ownerKey), {
      ...localProfile,
      name: profile?.name || localProfile.name || '',
      phone: profile?.phone || localProfile.phone || '',
      bizName: profile?.business_name || localProfile.bizName || '',
      bizNumber: profile?.business_number || localProfile.bizNumber || '',
      bizAddress: profile?.business_address || localProfile.bizAddress || '',
      bizType: profile?.business_type || localProfile.bizType || '',
      bizItem: profile?.business_item || localProfile.bizItem || '',
      bizEmail: profile?.business_email || localProfile.bizEmail || '',
      bankName: profile?.bank_name || localProfile.bankName || '',
      accountNumber: profile?.account_number || localProfile.accountNumber || '',
    })

    if (!vehiclesError && Array.isArray(vehicles) && vehicles.length) {
      const cars = vehicles.map((row) => {
        const raw = row.raw && typeof row.raw === 'object' ? row.raw : {}
        return {
          ...raw,
          id: raw.id || `car-${row.id}`,
          number: row.number || '',
          type: row.type || 'main',
          tonnage: row.tonnage || '',
          supabaseId: row.id,
          driverName: row.driver_name ?? raw.driverName ?? '',
          settlementMode: row.settlement_mode ?? raw.settlementMode ?? null,
          commEnabled: row.comm_enabled ?? !!raw.commEnabled,
          commType: row.comm_type ?? raw.commType ?? null,
          commission: row.comm_value ?? raw.commission ?? '',
        }
      })
      const previous = readJson(keyFor(KEYS.cars, ownerKey), [])
      const unsynced = previous.filter((car) => car && !car.supabaseId)
      writeJson(keyFor(KEYS.cars, ownerKey), [...cars, ...unsynced])
    }

    if (!clientsError && Array.isArray(clientsRows) && clientsRows.length) {
      const clients = clientsRows.map((row) => ({
        ...(row.raw && typeof row.raw === 'object' ? row.raw : {}),
        companyName: row.company_name,
        id: row.legacy_client_id || row.id,
        supabaseId: row.id,
        isPinned: row.is_pinned ?? !!(row.raw && row.raw.isPinned),
      }))
      const previous = readJson(keyFor(KEYS.clients, ownerKey), [])
      const unsynced = previous.filter((client) => client && !client.supabaseId)
      writeJson(keyFor(KEYS.clients, ownerKey), [...clients, ...unsynced])
    }

    const cars = readJson(keyFor(KEYS.cars, ownerKey), [])
    const localDrivers = readJson(keyFor(KEYS.drivers, ownerKey), [])
    if (!linksError && Array.isArray(links)) {
      const byCode = new Map(localDrivers.map((item) => [item.inviteCode, item]))
      const merged = links.filter((row) => row.status !== 'disconnected').map((row) => {
        const car = cars.find((item) => item.supabaseId === row.vehicle_id)
        const local = byCode.get(row.invite_code) || localDrivers.find((item) => item.supabaseId === row.id) || {}
        return {
          ...local,
          id: local.id || row.id,
          supabaseId: row.id,
          inviteCode: row.invite_code,
          vehicleNumber: car?.number || local.vehicleNumber || '',
          startDate: row.assignment_start || '',
          endDate: row.assignment_end || '',
          status: row.status === 'linked' ? 'linked' : 'pending',
          name: local.name || local.driverName || '기사',
          phone: local.phone || '',
        }
      })
      if (merged.length) writeJson(keyFor(KEYS.drivers, ownerKey), merged)
    }

    const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
    const emptyChild = { data: [], error: null }
    const { fuelRes, maintRes, miscRes } = mainCar?.supabaseId
      ? await hydrateWorkData(ownerKey, mainCar.supabaseId)
      : { fuelRes: emptyChild, maintRes: emptyChild, miscRes: emptyChild }

    applyHydratedExpenses({
      ownerKey,
      table: 'fuel_records',
      kind: 'fuel',
      result: fuelRes,
      snapshot,
      previousExpenses,
      mapRow: expenseFromFuelRecord,
      replace: replaceFuelExpenses,
    })
    applyHydratedExpenses({
      ownerKey,
      table: 'maintenance_records',
      kind: 'maint',
      result: maintRes,
      snapshot,
      previousExpenses,
      mapRow: expenseFromMaintenanceRecord,
      replace: replaceMaintExpenses,
    })
    applyHydratedExpenses({
      ownerKey,
      table: 'misc_expense_records',
      kind: 'misc',
      result: miscRes,
      snapshot,
      previousExpenses,
      mapRow: expenseFromMiscRecord,
      replace: replaceMiscExpenses,
    })

    await hydrateTaxInvoices(ownerKey, userId)

    hydrationCompleted = true
    return collectPracticeSnapshot(ownerKey)
  } finally {
    setHydration({ completed: true, userId: cloudUserId, ownerKey: cloudOwnerKey })
  }
}

function applyHydratedExpenses({ ownerKey, table, kind, result, snapshot, previousExpenses, mapRow, replace }) {
  if (result?.error) {
    console.warn(`[Supabase] ${table} 조회 실패, 로컬 내역을 유지합니다.`, result.error)
    return
  }
  const current = readJson(keyFor(KEYS.expenses, ownerKey), [])
  if ((result?.data || []).length) {
    writeJson(keyFor(KEYS.expenses, ownerKey), replace(current, result.data.map((row, index) => mapRow(row, index))))
    return
  }
  const snapshotKind = (snapshot.expenses || []).filter((item) => item.kind === kind)
  const localKind = (previousExpenses || []).filter((item) => item.kind === kind)
  const keep = snapshotKind.length ? snapshotKind : localKind
  writeJson(keyFor(KEYS.expenses, ownerKey), replace(current, keep))
}

async function hydrateTaxInvoices(ownerKey, userId) {
  const { data, error } = await supabase.from('tax_invoices').select('*').eq('user_id', userId)
  if (error) {
    console.warn('[Supabase] tax_invoices 조회 실패, 로컬 세금계산서를 유지합니다.', error)
    return
  }
  const local = readJson(keyFor(KEYS.invoices, ownerKey), [])
  writeJson(keyFor(KEYS.invoices, ownerKey), mergeTaxInvoiceRecords(local, data || []))
}

async function hydrateWorkData(ownerKey, vehicleId) {
  const [dailyRes, transportRes, fuelRes, maintRes, miscRes] = await Promise.all([
    supabase.from('daily_logs').select('*').eq('vehicle_id', vehicleId),
    supabase.from('transport_details').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
    supabase.from('fuel_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
    supabase.from('maintenance_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
    supabase.from('misc_expense_records').select('*').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }),
  ])
  if (dailyRes.error) {
    console.warn('[Supabase] daily_logs 조회 실패, 로컬 운행기록을 유지합니다.', dailyRes.error)
    return { fuelRes, maintRes, miscRes }
  }
  const byDate = {}
  ;(dailyRes.data || []).forEach((row) => {
    byDate[row.work_date] = {
      ...(row.raw && typeof row.raw === 'object' ? row.raw : {}),
      isOff: !!row.is_off,
      fixedCount: row.fixed_count || 0,
      callDetails: [],
      fuelItems: [],
      maintItems: [],
      miscItems: [],
    }
  })
  ;(transportRes.data || []).forEach((row) => {
    if (!byDate[row.work_date]) return
    byDate[row.work_date].callDetails.push(row.raw && typeof row.raw === 'object' ? row.raw : {})
  })
  if (!fuelRes.error) {
    ;(fuelRes.data || []).forEach((row) => {
      if (!byDate[row.work_date]) return
      byDate[row.work_date].fuelItems.push(row.raw && typeof row.raw === 'object' ? row.raw : expenseFromFuelRecord(row))
    })
  }
  if (!maintRes.error) {
    ;(maintRes.data || []).forEach((row) => {
      if (!byDate[row.work_date]) return
      byDate[row.work_date].maintItems.push(row.raw && typeof row.raw === 'object' ? row.raw : expenseFromMaintenanceRecord(row))
    })
  }
  if (!miscRes.error) {
    ;(miscRes.data || []).forEach((row) => {
      if (!byDate[row.work_date]) return
      byDate[row.work_date].miscItems.push(row.raw && typeof row.raw === 'object' ? row.raw : expenseFromMiscRecord(row))
    })
  }
  const localExisting = readJson(keyFor(KEYS.work, ownerKey), {})
  writeJson(keyFor(KEYS.work, ownerKey), { ...localExisting, ...byDate })
  return { fuelRes, maintRes, miscRes }
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

async function syncAll(userId, ownerKey) {
  if (syncing) {
    scheduleCloudSync()
    return
  }
  syncing = true
  try {
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
  } finally {
    syncing = false
  }
}

export async function deleteVehicleFromSupabase(vehicleSupabaseId) {
  if (!vehicleSupabaseId) return
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
  const user = cloudUserId
  if (!user) throw new Error('로그인이 필요합니다.')
  const baseRow = {
    owner_id: user,
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
  const { error } = await supabase.from('driver_links').update({ status, updated_at: new Date().toISOString() }).eq('id', supabaseId)
  if (error) throw error
}

export async function deleteDriverLinkOnSupabase(supabaseId) {
  if (!supabaseId) return
  const { error } = await supabase.from('driver_links').delete().eq('id', supabaseId)
  if (error) throw error
}

export async function saveDriverInviteToCloud(items, editingId, cars) {
  if (!cloudUserId || !cloudOwnerKey) return { items }
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

export async function flushCloudSync() {
  if (!hydrationCompleted || !cloudUserId || !cloudOwnerKey) return
  if (syncTimer) clearTimeout(syncTimer)
  await syncAll(cloudUserId, cloudOwnerKey)
}
