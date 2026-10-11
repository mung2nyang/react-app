// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 일상점검표 서버 읽기·저장(daily_inspections 표, 차량+날짜 1장). 로컬 보관·재시도 큐 없음 — 일지를 열 때 읽고 저장은 바로 서버.
import { supabase } from '../supabaseClient.js'
import { sanitizeInspectionItems } from '../domain/dailyInspectionItems.js'
import { assertSessionStillCurrent, blockedReasonForCloudWrite, captureSession, getCloudUserId } from './cloudSession.js'

/** @typedef {import('../domain/dailyInspectionItems.js').InspectionItems} InspectionItems */
/** @typedef {{ items: InspectionItems, actionNote: string, inspectorName: string }} DailyInspection */

/**
 * 그 차량·날짜 점검표 1장. 없으면 null.
 * @param {string|number} vehicleId
 * @param {string} workDate
 * @returns {Promise<DailyInspection|null>}
 */
export async function fetchDailyInspection(vehicleId, workDate) {
  const { data, error } = await supabase
    .from('daily_inspections')
    .select('items, action_note, inspector_name')
    .eq('vehicle_id', vehicleId)
    .eq('work_date', workDate)
    .maybeSingle()
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  return toDailyInspection(data)
}

/** @param {{ items?: JsonValue, action_note?: JsonValue, inspector_name?: JsonValue }} row @returns {DailyInspection} */
function toDailyInspection(row) {
  return {
    items: sanitizeInspectionItems(row.items),
    actionNote: typeof row.action_note === 'string' ? row.action_note : '',
    inspectorName: typeof row.inspector_name === 'string' ? row.inspector_name : '',
  }
}

/**
 * 저장(차량+날짜 덮어쓰기). 작성자 = 로그인 사용자, 점검자 이름 = 저장 순간 이름(9-A 결정 4).
 * @param {{ vehicleId: string|number, workDate: string, items: InspectionItems, actionNote: string, inspectorName: string }} input
 */
export async function saveDailyInspection({ vehicleId, workDate, items, actionNote, inspectorName }) {
  const userId = getCloudUserId()
  if (!userId) throw new Error('로그인 후 저장할 수 있습니다.')
  const blocked = blockedReasonForCloudWrite(String(vehicleId))
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  const { error } = await supabase.from('daily_inspections').upsert({
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    items,
    action_note: actionNote.trim() || null,
    inspector_name: inspectorName,
  }, { onConflict: 'vehicle_id,work_date' })
  assertSessionStillCurrent(captured)
  if (error) throw error
}

/**
 * 서류 발급 한 달 표(9-C-1): 그 차량·그 달 점검표를 날짜별로 한 번에 읽음(9-D: 법정 서식용 점검자·조치 기록 포함).
 * @param {string|number} vehicleId
 * @param {number} year
 * @param {number} month 0부터
 * @returns {Promise<Record<string, DailyInspection>>}
 */
export async function fetchMonthDailyInspections(vehicleId, year, month) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const last = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('daily_inspections')
    .select('work_date, items, action_note, inspector_name')
    .eq('vehicle_id', vehicleId)
    .gte('work_date', first)
    .lte('work_date', last)
  if (error) throw error
  /** @type {Record<string, DailyInspection>} */
  const byDate = {}
  for (const row of Array.isArray(data) ? data : []) {
    if (row && typeof row.work_date === 'string') byDate[row.work_date] = toDailyInspection(row)
  }
  return byDate
}

/**
 * 데이터 다운로드(B-1): 내 차량들의 점검표 전체를 차량 id → 날짜별로 한 번에 읽음.
 * @param {Array<string|number>} vehicleIds
 * @returns {Promise<Record<string, Record<string, DailyInspection>>>}
 */
export async function fetchVehiclesDailyInspections(vehicleIds) {
  /** @type {Record<string, Record<string, DailyInspection>>} */
  const byVehicle = {}
  if (!vehicleIds.length) return byVehicle
  const { data, error } = await supabase
    .from('daily_inspections')
    .select('vehicle_id, work_date, items, action_note, inspector_name')
    .in('vehicle_id', vehicleIds)
  if (error) throw error
  for (const row of Array.isArray(data) ? data : []) {
    if (!row || row.vehicle_id == null || typeof row.work_date !== 'string') continue
    const key = String(row.vehicle_id)
    byVehicle[key] = { ...(byVehicle[key] || {}), [row.work_date]: toDailyInspection(row) }
  }
  return byVehicle
}

/**
 * 탭 숨김 판단: 그 차량 점검표가 1장이라도 있는지.
 * @param {string|number} vehicleId
 */
export async function hasAnyDailyInspection(vehicleId) {
  const { data, error } = await supabase.from('daily_inspections').select('id').eq('vehicle_id', vehicleId).limit(1)
  if (error) throw error
  return Array.isArray(data) && data.length > 0
}
