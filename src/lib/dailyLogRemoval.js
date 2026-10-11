// @ts-check
// 비용 행은 daily_logs에 ON DELETE CASCADE로 묶여 있다 — 그날 비용이 남아 있으면 줄을 지우지 않고 빈 기록으로 둔다.
import { supabase } from '../supabaseClient.js'

const EXPENSE_TABLES = ['fuel_records', 'maintenance_records', 'misc_expense_records']

/**
 * @param {number|string} vehicleId @param {string} workDate
 * @returns {Promise<boolean>}
 */
async function hasExpenseRows(vehicleId, workDate) {
  for (const table of EXPENSE_TABLES) {
    const { data, error } = await supabase.from(table).select('id').eq('vehicle_id', vehicleId).eq('work_date', workDate).limit(1)
    if (error) throw error
    if (Array.isArray(data) && data.length) return true
  }
  return false
}

/**
 * 빈 날이 된 그 날짜의 콜 상세를 지우고, 그날 비용이 있으면 하루 기록 줄을 빈 기록으로 남기고 없으면 줄을 지운다(멱등).
 * @param {number|string} vehicleId @param {string} workDate
 */
export async function removeDayLogOnServer(vehicleId, workDate) {
  const { error: detailError } = await supabase.from('transport_details').delete().eq('vehicle_id', vehicleId).eq('work_date', workDate)
  if (detailError) throw detailError
  if (await hasExpenseRows(vehicleId, workDate)) {
    const { error: blankError } = await supabase.from('daily_logs')
      .update({ is_off: false, fixed_count: 0, pallet_count: 0, raw: {} })
      .eq('vehicle_id', vehicleId).eq('work_date', workDate)
    if (blankError) throw blankError
    return
  }
  const { error } = await supabase.from('daily_logs').delete().eq('vehicle_id', vehicleId).eq('work_date', workDate)
  if (error) throw error
}
