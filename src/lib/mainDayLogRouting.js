// @ts-check
// 슬라이스 D(2026-09-01): "이 일지 저장이 클라우드 Fail-Fast 경로인가"를 한 곳에서
// 판정한다. useDayDraft / dayLogCloudCommit / pendingWriteRetryListeners가 공유한다.
// Step 9 슬라이스 A(2026-09-03): main 전용 → logId(메인·기사 차량번호)로 일반화.
// 무거운 supabase 실행기를 끌어오지 않도록 app-store·cloudSession만 의존한다.
import { getState } from '../store/app-store.js'
import { getCloudUserId } from './cloudSession.js'

/**
 * logId에 해당하는 차량의 supabaseId. `main`(또는 빈 값)이면 메인 차량,
 * 그 외면 차량번호(number)가 logId와 같은 차량. 없으면 null.
 * @param {string} ownerKey
 * @param {string} [logId]
 * @returns {number|string|null}
 */
export function vehicleSupabaseIdForLog(ownerKey, logId = 'main') {
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
 * 이 owner의 메인 차량 supabaseId(서버에 동기화된 것). 없으면 null.
 * @param {string} ownerKey
 * @returns {number|string|null}
 */
export function mainCarSupabaseId(ownerKey) {
  return vehicleSupabaseIdForLog(ownerKey, 'main')
}

/**
 * 로그인 + logId 차량이 서버에 있으면, 그 날짜 daily_logs에 직접 쓰고
 * durable / fallback / unsafe / retry 큐를 쓰지 않는 Fail-Fast 경로다.
 * @param {string} ownerKey
 * @param {string} [logId]
 */
export function shouldCommitDayLogToCloud(ownerKey, logId) {
  if (!getCloudUserId()) return false
  return vehicleSupabaseIdForLog(ownerKey, logId) != null
}
