// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — syncAll이 부르는 일반 동기화 큐의
// 정비/주유/기타 비용 upsert. 세 함수가 테이블/필드명만 다르고 구조가 동일하지만,
// 이미 200줄 안에 들어오고("단순히 합치기 위한" 기계적 분할을 피하라는 지시도 있어)
// 기존 동작을 한 글자도 안 바꾸는 쪽을 택해 그대로 옮겼다.
import { supabase } from '../supabaseClient.js'
import { buildFuelRecordRow, groupFuelExpensesByDate } from '../domain/fuelRecords.js'
import { buildMaintenanceRecordRow, groupMaintExpensesByDate } from '../domain/maintenanceRecords.js'
import { buildMiscExpenseRecordRow, groupMiscExpensesByDate } from '../domain/miscExpenseRecords.js'
import { KEYS, keyFor, readJson } from './cloudStorage.js'
import { upsertDailyLog } from './syncWorkData.js'

async function dailyLogIdsByDate(vehicleSupabaseId) {
  const { data: logs, error: logsError } = await supabase
    .from('daily_logs')
    .select('id, work_date')
    .eq('vehicle_id', vehicleSupabaseId)
  if (logsError) throw logsError
  return new Map((logs || []).map((row) => [row.work_date, row.id]))
}

export async function syncFuelRecords(userId, ownerKey, cars) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const expenses = readJson(keyFor(KEYS.expenses, ownerKey), [])
  const workData = readJson(keyFor(KEYS.work, ownerKey), {})
  const fuelByDate = groupFuelExpensesByDate(expenses)
  const dates = new Set([...Object.keys(workData || {}), ...Object.keys(fuelByDate)])
  const idByDate = await dailyLogIdsByDate(mainCar.supabaseId)

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
      dailyLogId, userId, vehicleId: mainCar.supabaseId, workDate,
    })))
    if (insertError) throw insertError
  }
}

export async function syncMaintenanceRecords(userId, ownerKey, cars) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const expenses = readJson(keyFor(KEYS.expenses, ownerKey), [])
  const workData = readJson(keyFor(KEYS.work, ownerKey), {})
  const maintByDate = groupMaintExpensesByDate(expenses)
  const dates = new Set([...Object.keys(workData || {}), ...Object.keys(maintByDate)])
  const idByDate = await dailyLogIdsByDate(mainCar.supabaseId)

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
      dailyLogId, userId, vehicleId: mainCar.supabaseId, workDate,
    })))
    if (insertError) throw insertError
  }
}

export async function syncMiscExpenseRecords(userId, ownerKey, cars) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const expenses = readJson(keyFor(KEYS.expenses, ownerKey), [])
  const workData = readJson(keyFor(KEYS.work, ownerKey), {})
  const miscByDate = groupMiscExpensesByDate(expenses)
  const dates = new Set([...Object.keys(workData || {}), ...Object.keys(miscByDate)])
  const idByDate = await dailyLogIdsByDate(mainCar.supabaseId)

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
      dailyLogId, userId, vehicleId: mainCar.supabaseId, workDate,
    })))
    if (insertError) throw insertError
  }
}
