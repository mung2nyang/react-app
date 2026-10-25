// 운비서 일상점검표 — 일지 안내 줄과 같은 조건·같은 저장으로 그날 점검표를 모두 양호로.
import { readOwnerCars, readOwnerDrivers, readOwnerProfile, readOwnerSettings, readOwnerWorkData } from '../../../data/store/ownerDataHooks.ts'
import { fetchDailyInspection, saveDailyInspection } from '../../../data/sync/dailyInspections.ts'
import { vehicleSupabaseIdForLog } from '../../../data/sync/mainDayLogRouting.ts'
import { resolveLogSettings } from '../../../domain/carSettingsScope.ts'
import { allGoodItems } from '../../../domain/dailyInspectionItems.ts'
import { isOffDay } from '../../../domain/day-record.ts'
import { assignmentPeriodNotice } from '../../../domain/drivers.ts'
import { SERVER_SAVE_FAIL } from '../../../shared/utils/failureMessages.js'
import { TRY_LATER } from './unbiseoParse.ts'
import { dateLabelOf } from './unbiseoSentence.ts'

/** [저장하기]가 저장할 것 — 차량·날짜·점검자 이름은 물을 때 정한 값 그대로. */
export type UnbiseoInspectionSave = { date: string, vehicleId: number | string, inspectorName: string }
export type InspectionCheck = { sentence: string, save: UnbiseoInspectionSave | null }

export const INSPECTION_SETTING_OFF = '앱 설정에서 일상점검표 사용을 켜면 쓸 수 있어요.'
export const INSPECTION_DAY_OFF = '휴무 날은 일상점검표를 쓰지 않아요.'
export const INSPECTION_NO_VEHICLE = '일상점검표를 저장할 차량이 없어요.'

function only(sentence: string): InspectionCheck {
  return { sentence, save: null }
}

/** 설정 꺼짐 → 계약 기간 밖 → 휴무 → 차량 없음 → 이미 저장됨 순서로 처음 걸리는 것 하나. 다 지나면 [저장하기]. 값은 묻는 그 순간 것. */
export async function checkInspection(owner: string, date: string, today: string, isDriver: boolean): Promise<InspectionCheck> {
  if (!resolveLogSettings(readOwnerSettings(owner), 'main').dailyInspectionOn) return only(INSPECTION_SETTING_OFF)
  const link = isDriver ? readOwnerDrivers(owner).find((driver) => driver.status === 'linked') : null
  const notice = isDriver ? assignmentPeriodNotice(date, link?.startDate, link?.endDate) : null
  if (notice) return only(`${notice.title} ${notice.body}`)
  if (isOffDay(readOwnerWorkData(owner)[date])) return only(INSPECTION_DAY_OFF)
  const vehicleId = vehicleSupabaseIdForLog(owner, 'main')
  if (vehicleId == null) return only(INSPECTION_NO_VEHICLE)
  // 점검자 이름은 일지 점검표 창과 같게 — 메인 차량 기사 이름, 없으면 내 이름.
  const car = readOwnerCars(owner).find((item) => item.type === 'main')
  const inspectorName = String(car?.driverName || readOwnerProfile(owner).name || '').trim()
  const label = dateLabelOf(date, today)
  try {
    if (await fetchDailyInspection(vehicleId, date)) return only(`${label} 일상점검표는 이미 저장되어 있어요.`)
  } catch (error) {
    console.error('[운비서 점검표] 불러오기 실패:', error)
    return only(TRY_LATER)
  }
  return { sentence: `${label} 일상점검표를 모두 양호로 저장할게요.`, save: { date, vehicleId, inspectorName } }
}

/** 일지 점검표 창과 같은 저장(11항목 양호, 조치 기록 빈 칸). 성공이면 null, 실패면 알림 문구. */
export async function saveAllGood(save: UnbiseoInspectionSave): Promise<string | null> {
  try {
    await saveDailyInspection({ vehicleId: save.vehicleId, workDate: save.date, items: allGoodItems(), actionNote: '', inspectorName: save.inspectorName })
    return null
  } catch (error) {
    console.error('[운비서 점검표] 저장 실패:', error)
    return error instanceof Error && error.message ? error.message : SERVER_SAVE_FAIL
  }
}

export function savedSentence(date: string, today: string): string {
  return `${dateLabelOf(date, today)} 일상점검표를 모두 양호로 저장했어요.`
}
