// @ts-check
// 슬라이스 D(2026-09-01): "이 일지 저장이 클라우드 Fail-Fast 경로인가"를 한 곳에서
// 판정한다. useDayDraft / dayLogCloudCommit / pendingWriteRetryListeners가 공유한다.
// 무거운 supabase 실행기를 끌어오지 않도록 app-store·cloudSession만 의존한다.
import { getState } from '../store/app-store.js'
import { getCloudUserId } from './cloudSession.js'

/**
 * 이 owner의 메인 차량 supabaseId(서버에 동기화된 것). 없으면 null.
 * @param {string} ownerKey
 * @returns {number|string|null}
 */
export function mainCarSupabaseId(ownerKey) {
  const cars = getState().cars[ownerKey]
  const list = Array.isArray(cars) ? cars : []
  const main = list.find((car) => car.type === 'main' && car.supabaseId) || list.find((car) => car.supabaseId)
  return main?.supabaseId ?? null
}

/**
 * 로그인 + logId가 메인 + 서버에 있는 메인 차량이면, 그 날짜 daily_logs에 직접 쓰고
 * durable / fallback / unsafe / retry 큐를 쓰지 않는 슬라이스 D 경로다.
 * @param {string} ownerKey
 * @param {string} [logId]
 */
export function shouldCommitDayLogToCloud(ownerKey, logId) {
  if (logId && logId !== 'main') return false
  if (!getCloudUserId()) return false
  return mainCarSupabaseId(ownerKey) != null
}
