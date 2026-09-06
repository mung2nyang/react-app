// @ts-check
// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — syncAll이 부르는 일반 동기화 큐의
// 운행기록(daily_logs+transport_details) upsert.
import { supabase } from '../supabaseClient.js'
import { KEYS, keyFor, parseEntityNumber, readJson } from './cloudStorage.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

/**
 * @param {string} userId
 * @param {string} ownerKey
 * @param {Array<CarLike>} cars
 * @param {Array<ClientLike>} clients
 */
export async function syncWorkData(userId, ownerKey, cars, clients) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const workData = /** @type {Record<string, unknown>} */ (readJson(keyFor(KEYS.work, ownerKey), {}) || {})
  const clientIdByName = new Map((clients || []).filter((item) => item.supabaseId).map((item) => [item.companyName, item.supabaseId]))
  for (const [workDate, rawRecord] of Object.entries(workData)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !rawRecord || typeof rawRecord !== 'object') continue
    const record = /** @type {Record<string, unknown>} */ (rawRecord)
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
    const { error: deleteError } = await supabase.from('transport_details').delete().eq('daily_log_id', data?.id)
    if (deleteError) throw deleteError
    if (callDetails.length) {
      const { error: detailError } = await supabase.from('transport_details').insert(callDetails.map((detail, index) => ({
        daily_log_id: data?.id,
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

/**
 * @param {string} userId
 * @param {string|number} vehicleId
 * @param {string} workDate
 * @param {unknown} record
 * @returns {Promise<string>}
 */
export async function upsertDailyLog(userId, vehicleId, workDate, record) {
  const safeRecord = /** @type {Record<string, unknown>} */ (record && typeof record === 'object' ? record : { isOff: false, fixedCount: 0 })
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
