// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 일지 한 줄(daily_logs) 저장 — 로그인 일지·지출 저장이 같이 쓴다.
import { supabase } from '../supabaseClient.js'
import { parseEntityNumber } from './cloudStorage.js'

/**
 * @param {string} userId
 * @param {string|number} vehicleId
 * @param {string} workDate
 * @param {JsonValue|undefined} record
 * @returns {Promise<string>}
 */
export async function upsertDailyLog(userId, vehicleId, workDate, record) {
  const safeRecord = /** @type {Record<string, JsonValue|undefined>} */ (record && typeof record === 'object' ? record : { isOff: false, fixedCount: 0 })
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
  // .single()은 성공 시 정확히 1행을 보장 — error가 없으면 data는 non-null.
  return /** @type {string} */ (data?.id)
}
