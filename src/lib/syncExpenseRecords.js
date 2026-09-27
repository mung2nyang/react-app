// @ts-check
// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — syncAll이 부르는 일반 동기화 큐의
// 정비/주유/기타 비용 upsert. 세 함수가 테이블/필드명만 다르고 구조가 동일하지만,
// 이미 200줄 안에 들어오고("단순히 합치기 위한" 기계적 분할을 피하라는 지시도 있어)
// 기존 동작을 한 글자도 안 바꾸는 쪽을 택해 그대로 옮겼다.
// 로드맵 5-A: 차량은 호출부가 planExpenseVehicleTargets로 나눠 넘긴다.
import { supabase } from '../supabaseClient.js'
import { buildFuelRecordRow, groupFuelExpensesByDate } from '../domain/fuelRecords.js'
import { buildMaintenanceRecordRow, groupMaintExpensesByDate } from '../domain/maintenanceRecords.js'
import { buildMiscExpenseRecordRow, groupMiscExpensesByDate } from '../domain/miscExpenseRecords.js'
import { upsertDailyLog } from './syncWorkData.js'

/** @typedef {import('../domain/expenseVehicleRouting.js').ExpenseVehicleTarget} ExpenseVehicleTarget */

/**
 * 운행기록·항목·정리 날짜를 합친 순회 날짜.
 * @param {Record<string, unknown>} workData
 * @param {Record<string, unknown>} byDate
 * @param {Set<string>} cleanup
 */
function syncDates(workData, byDate, cleanup) {
  return new Set([...Object.keys(workData || {}), ...Object.keys(byDate), ...cleanup])
}

/**
 * @param {string|number} vehicleSupabaseId
 * @returns {Promise<Map<string, string>>}
 */
async function dailyLogIdsByDate(vehicleSupabaseId) {
  const { data: logs, error: logsError } = await supabase
    .from('daily_logs')
    .select('id, work_date')
    .eq('vehicle_id', vehicleSupabaseId)
  if (logsError) throw logsError
  return new Map((logs || []).map((row) => [row.work_date, row.id]))
}

/**
 * @param {string} userId
 * @param {ExpenseVehicleTarget} target
 * @param {Record<string, unknown>} workData
 */
export async function syncFuelRecords(userId, target, workData) {
  const vehicleId = target.vehicleId
  const cleanup = new Set(target.cleanupDates)
  const fuelByDate = groupFuelExpensesByDate(target.expenses)
  const dates = syncDates(workData, fuelByDate, cleanup)
  const idByDate = await dailyLogIdsByDate(vehicleId)

  for (const workDate of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue
    const fuelItems = fuelByDate[workDate] || []
    const record = workData[workDate]
    if (!record && !fuelItems.length && !cleanup.has(workDate)) continue
    let dailyLogId = idByDate.get(workDate)
    if (!dailyLogId) {
      if (!fuelItems.length) continue
      dailyLogId = await upsertDailyLog(userId, vehicleId, workDate, record)
      idByDate.set(workDate, dailyLogId)
    }
    const { error: deleteError } = await supabase.from('fuel_records').delete().eq('daily_log_id', dailyLogId)
    if (deleteError) throw deleteError
    if (!fuelItems.length) continue
    const { error: insertError } = await supabase.from('fuel_records').insert(fuelItems.map((item, index) => buildFuelRecordRow(item, index, {
      dailyLogId, userId, vehicleId, workDate,
    })))
    if (insertError) throw insertError
  }
}

/**
 * @param {string} userId
 * @param {ExpenseVehicleTarget} target
 * @param {Record<string, unknown>} workData
 */
export async function syncMaintenanceRecords(userId, target, workData) {
  const vehicleId = target.vehicleId
  const cleanup = new Set(target.cleanupDates)
  const maintByDate = groupMaintExpensesByDate(target.expenses)
  const dates = syncDates(workData, maintByDate, cleanup)
  const idByDate = await dailyLogIdsByDate(vehicleId)

  for (const workDate of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue
    const maintItems = maintByDate[workDate] || []
    const record = workData[workDate]
    if (!record && !maintItems.length && !cleanup.has(workDate)) continue
    let dailyLogId = idByDate.get(workDate)
    if (!dailyLogId) {
      if (!maintItems.length) continue
      dailyLogId = await upsertDailyLog(userId, vehicleId, workDate, record)
      idByDate.set(workDate, dailyLogId)
    }
    const { error: deleteError } = await supabase.from('maintenance_records').delete().eq('daily_log_id', dailyLogId)
    if (deleteError) throw deleteError
    if (!maintItems.length) continue
    const { error: insertError } = await supabase.from('maintenance_records').insert(maintItems.map((item, index) => buildMaintenanceRecordRow(item, index, {
      dailyLogId, userId, vehicleId, workDate,
    })))
    if (insertError) throw insertError
  }
}

/**
 * @param {string} userId
 * @param {ExpenseVehicleTarget} target
 * @param {Record<string, unknown>} workData
 */
export async function syncMiscExpenseRecords(userId, target, workData) {
  const vehicleId = target.vehicleId
  const cleanup = new Set(target.cleanupDates)
  const miscByDate = groupMiscExpensesByDate(target.expenses)
  const dates = syncDates(workData, miscByDate, cleanup)
  const idByDate = await dailyLogIdsByDate(vehicleId)

  for (const workDate of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue
    const miscItems = miscByDate[workDate] || []
    const record = workData[workDate]
    if (!record && !miscItems.length && !cleanup.has(workDate)) continue
    let dailyLogId = idByDate.get(workDate)
    if (!dailyLogId) {
      if (!miscItems.length) continue
      dailyLogId = await upsertDailyLog(userId, vehicleId, workDate, record)
      idByDate.set(workDate, dailyLogId)
    }
    const { error: deleteError } = await supabase.from('misc_expense_records').delete().eq('daily_log_id', dailyLogId)
    if (deleteError) throw deleteError
    if (!miscItems.length) continue
    const { error: insertError } = await supabase.from('misc_expense_records').insert(miscItems.map((item, index) => buildMiscExpenseRecordRow(item, index, {
      dailyLogId, userId, vehicleId, workDate,
    })))
    if (insertError) throw insertError
  }
}
