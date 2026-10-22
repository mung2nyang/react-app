// 서브 일지의 durable pending은 메인 owner 키와 섞이지 않게 `::log::`로 구분한다.
// 메인 일지는 기존 `${ownerKey}` 키를 그대로 쓴다.

export const LOG_OWNER_MARK = '::log::'

export function pendingOwnerForLog(ownerKey: string, logId = 'main') {
  if (!logId || logId === 'main') return ownerKey
  return `${ownerKey}${LOG_OWNER_MARK}${encodeURIComponent(logId)}`
}

export function parsePendingOwner(stored: string): { ownerKey: string, logId: string } {
  const index = stored.indexOf(LOG_OWNER_MARK)
  if (index < 0) return { ownerKey: stored, logId: 'main' }
  return {
    ownerKey: stored.slice(0, index),
    logId: decodeURIComponent(stored.slice(index + LOG_OWNER_MARK.length)),
  }
}
