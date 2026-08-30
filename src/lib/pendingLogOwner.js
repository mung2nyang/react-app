// @ts-check
// 서브 일지의 durable pending은 메인 owner 키와 섞이지 않게 `::log::`로 구분한다.
// 메인 일지는 기존 `${ownerKey}` 키를 그대로 써서 Step 6 큐와 호환된다.

export const LOG_OWNER_MARK = '::log::'

/**
 * @param {string} ownerKey
 * @param {string} [logId]
 */
export function pendingOwnerForLog(ownerKey, logId = 'main') {
  if (!logId || logId === 'main') return ownerKey
  return `${ownerKey}${LOG_OWNER_MARK}${encodeURIComponent(logId)}`
}

/**
 * @param {string} stored
 * @returns {{ ownerKey: string, logId: string }}
 */
export function parsePendingOwner(stored) {
  const index = stored.indexOf(LOG_OWNER_MARK)
  if (index < 0) return { ownerKey: stored, logId: 'main' }
  return {
    ownerKey: stored.slice(0, index),
    logId: decodeURIComponent(stored.slice(index + LOG_OWNER_MARK.length)),
  }
}
