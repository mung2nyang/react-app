// 일상점검표 서버 읽기·저장(daily_inspections 표, 차량+날짜 1장). 로컬 보관·재시도 큐 없음 — 일지를 열 때 읽고 저장은 바로 서버.
import type { JsonValue } from '../../domain/jsonTypes.ts'
import { supabase } from '../cloud/supabaseClient.ts'
import { sanitizeInspectionItems } from '../../domain/dailyInspectionItems.ts'
import { fetchAllRows } from '../cloud/fetchAllRows.ts'
import { assertSessionStillCurrent, blockedReasonForCloudWrite, captureSession, getCloudUserId } from '../cloud/cloudSession.ts'
import { notifyDailyInspectionChanged } from './dailyInspectionChanges.ts'
import type { InspectionItems } from '../../domain/dailyInspectionItems.ts'

export type DailyInspection = { items: InspectionItems, actionNote: string, inspectorName: string }

export const DELETE_FAIL = '일상점검표를 지우지 못했습니다.'

/** 그 차량·날짜 점검표 1장. 없으면 null. */
export async function fetchDailyInspection(vehicleId: string | number, workDate: string): Promise<DailyInspection | null> {
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

function toDailyInspection(row: { items?: JsonValue, action_note?: JsonValue, inspector_name?: JsonValue }): DailyInspection {
  return {
    items: sanitizeInspectionItems(row.items),
    actionNote: typeof row.action_note === 'string' ? row.action_note : '',
    inspectorName: typeof row.inspector_name === 'string' ? row.inspector_name : '',
  }
}

/** 저장(차량+날짜 덮어쓰기). 작성자 = 로그인 사용자, 점검자 이름 = 저장 순간 이름(9-A 결정 4). */
export async function saveDailyInspection({ vehicleId, workDate, items, actionNote, inspectorName }: { vehicleId: string | number, workDate: string, items: InspectionItems, actionNote: string, inspectorName: string }) {
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
  notifyDailyInspectionChanged({ vehicleId, workDate, saved: true })
}

/** 그 차량·날짜 점검표 지우기. 권한이 막으면 서버가 오류 없이 0줄을 지우므로 0줄도 실패로 본다. */
export async function deleteDailyInspection({ vehicleId, workDate }: { vehicleId: string | number, workDate: string }) {
  if (!getCloudUserId()) throw new Error('로그인 후 지울 수 있습니다.')
  const blocked = blockedReasonForCloudWrite(String(vehicleId))
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  const { data, error } = await supabase.from('daily_inspections').delete().eq('vehicle_id', vehicleId).eq('work_date', workDate).select('id')
  assertSessionStillCurrent(captured)
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error(DELETE_FAIL)
  notifyDailyInspectionChanged({ vehicleId, workDate, saved: false })
}

/**
 * 서류 발급 한 달 표(9-C-1): 그 차량·그 달 점검표를 날짜별로 한 번에 읽음(9-D: 법정 서식용 점검자·조치 기록 포함).
 * @param month 0부터
 */
export async function fetchMonthDailyInspections(vehicleId: string | number, year: number, month: number): Promise<Record<string, DailyInspection>> {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const last = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('daily_inspections')
    .select('work_date, items, action_note, inspector_name')
    .eq('vehicle_id', vehicleId)
    .gte('work_date', first)
    .lte('work_date', last)
  if (error) throw error
  const byDate: Record<string, DailyInspection> = {}
  for (const row of Array.isArray(data) ? data : []) {
    if (row && typeof row.work_date === 'string') byDate[row.work_date] = toDailyInspection(row)
  }
  return byDate
}

/** 데이터 다운로드(B-1): 내 차량들의 점검표 전체를 차량 id → 날짜별로 한 번에 읽음. */
export async function fetchVehiclesDailyInspections(vehicleIds: Array<string | number>): Promise<Record<string, Record<string, DailyInspection>>> {
  const byVehicle: Record<string, Record<string, DailyInspection>> = {}
  if (!vehicleIds.length) return byVehicle
  const { data, error } = await fetchAllRows(() => supabase
    .from('daily_inspections')
    .select('vehicle_id, work_date, items, action_note, inspector_name')
    .in('vehicle_id', vehicleIds)
    .order('id'))
  if (error) throw error
  for (const row of Array.isArray(data) ? data : []) {
    if (!row || row.vehicle_id == null || typeof row.work_date !== 'string') continue
    const key = String(row.vehicle_id)
    byVehicle[key] = { ...(byVehicle[key] || {}), [row.work_date]: toDailyInspection(row) }
  }
  return byVehicle
}

/** 탭 숨김 판단: 그 차량 점검표가 1장이라도 있는지. */
export async function hasAnyDailyInspection(vehicleId: string | number) {
  const { data, error } = await supabase.from('daily_inspections').select('id').eq('vehicle_id', vehicleId).limit(1)
  if (error) throw error
  return Array.isArray(data) && data.length > 0
}
