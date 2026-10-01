// @ts-check
// 로드맵 9-B-2: 일상점검표 서버 읽기·저장(9-A 표 daily_inspections, 차량+날짜 1장). 로컬 보관·재시도 큐 없음 — 일지를 열 때 읽고 저장은 바로 서버.
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
  return {
    items: sanitizeInspectionItems(data.items),
    actionNote: typeof data.action_note === 'string' ? data.action_note : '',
    inspectorName: typeof data.inspector_name === 'string' ? data.inspector_name : '',
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
