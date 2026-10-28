// "이 일지 저장이 클라우드 직접 저장 경로인가"를 logId(메인·기사 차량번호)별로 한 곳에서 판정한다(useDayDraft·dayLogCloudCommit·pendingWriteRetryListeners 공유).
// 무거운 supabase 실행기를 끌어오지 않도록 app-store·cloudSession만 의존한다.
import { getState } from '../store/app-store.ts'
import { getCloudUserId } from '../cloud/cloudSession.ts'

/**
 * logId에 해당하는 차량의 supabaseId. `main`(또는 빈 값)이면 메인 차량,
 * 그 외면 차량번호(number)가 logId와 같은 차량. 없으면 null.
 */
export function vehicleSupabaseIdForLog(ownerKey: string, logId = 'main'): number | string | null {
  const cars = getState().cars[ownerKey]
  const list = Array.isArray(cars) ? cars : []
  if (!logId || logId === 'main') {
    const main = list.find((car) => car.type === 'main' && car.supabaseId) || list.find((car) => car.supabaseId)
    return main?.supabaseId ?? null
  }
  const matched = list.find((car) => car.number === logId && car.supabaseId)
  return matched?.supabaseId ?? null
}

/**
 * 로그인 + logId 차량이 서버에 있으면, 그 날짜 daily_logs에 직접 쓰고
 * durable / fallback / unsafe / retry 큐를 쓰지 않는 Fail-Fast 경로다.
 */
export function shouldCommitDayLogToCloud(ownerKey: string, logId?: string) {
  if (!getCloudUserId()) return false
  return vehicleSupabaseIdForLog(ownerKey, logId) != null
}

/** 로그인 계정인데 이 일지를 저장할 서버 차량이 없음 — 로그인 기록은 휴대폰에 안 남아 그대로 두면 사라진다. */
export function hasNoCloudVehicle(ownerKey: string, logId?: string) {
  return !!getCloudUserId() && vehicleSupabaseIdForLog(ownerKey, logId) == null
}
