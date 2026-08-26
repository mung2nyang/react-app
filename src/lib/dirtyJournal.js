// Step 0-4 감사 보완 2차: pendingWhileBlocked(boolean, 메모리 전용)를 owner별·슬라이스별
// durable journal로 교체한다. localStorage에 저장하므로 새로고침해도 "이 owner의 이
// 슬라이스는 아직 서버에 못 보낸 로컬 변경이 있다"는 사실이 안 지워진다. revision은
// commit할 때마다 올라가는 카운터 — 지금은 "0보다 크면 dirty"로만 쓰지만, 나중에
// 낙관적 동시성/충돌 감지에도 쓸 수 있게 값 자체를 남겨 둔다.
const JOURNAL_PREFIX = 'reactPracticeDirtyJournal'

function journalKey(ownerKey) {
  return `${JOURNAL_PREFIX}:${ownerKey}`
}

function readJournal(ownerKey) {
  try {
    const raw = localStorage.getItem(journalKey(ownerKey))
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeJournal(ownerKey, journal) {
  localStorage.setItem(journalKey(ownerKey), JSON.stringify(journal))
}

/**
 * domain 하나를 dirty로 표시하고 revision을 1 올린다("아직 서버에 못 보낸 로컬
 * 변경이 있다"는 사실을 새로고침 이후에도 남긴다).
 * @param {string} ownerKey
 * @param {string} domain
 */
export function markDirty(ownerKey, domain) {
  const journal = readJournal(ownerKey)
  writeJournal(ownerKey, { ...journal, [domain]: (journal[domain] || 0) + 1 })
}

/**
 * @param {string} ownerKey
 * @returns {boolean} 이 owner에 dirty로 남은 domain이 하나라도 있으면 true.
 */
export function hasDirty(ownerKey) {
  const journal = readJournal(ownerKey)
  return Object.values(journal).some((revision) => revision > 0)
}

/**
 * @param {string} ownerKey
 * @returns {Array<string>} dirty로 표시된 domain 이름 목록.
 */
export function getDirtyDomains(ownerKey) {
  const journal = readJournal(ownerKey)
  return Object.keys(journal).filter((domain) => journal[domain] > 0)
}

/**
 * 동기화가 성공적으로 끝난 뒤에만 부른다 — 실패했으면 절대 지우면 안 된다(다음 재시도가
 * "할 일이 없다"고 착각하게 된다).
 * @param {string} ownerKey
 */
export function clearDirty(ownerKey) {
  writeJournal(ownerKey, {})
}
