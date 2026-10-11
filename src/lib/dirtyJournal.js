// @ts-check

// owner별·도메인별 dirty journal(localStorage) — 새로고침해도 "아직 서버에 못 보낸 변경"이 남는다. revision은 commit마다 오르는 카운터.

const JOURNAL_PREFIX = 'reactPracticeDirtyJournal'

/**
 * @param {string} ownerKey
 * @returns {string}
 */
function journalKey(ownerKey) {
  return `${JOURNAL_PREFIX}:${ownerKey}`
}

/**
 * 각 domain revision을 `Number()||0`으로 정규화한다.
 * @param {string} ownerKey
 * @returns {Record<string, number>}
 */
function readJournal(ownerKey) {
  try {
    const raw = localStorage.getItem(journalKey(ownerKey))
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    /** @type {Record<string, number>} */
    const journal = {}
    for (const [domain, revision] of Object.entries(parsed)) {
      journal[domain] = Number(revision) || 0
    }
    return journal
  } catch {
    return {}
  }
}

/**
 * @param {string} ownerKey
 * @param {Record<string, number>} journal
 */
function writeJournal(ownerKey, journal) {
  localStorage.setItem(journalKey(ownerKey), JSON.stringify(journal))
}

/**
 * domain 하나를 dirty로 표시하고 revision을 1 올린다("아직 서버에 못 보낸 로컬
 * 변경이 있다"는 사실을 새로고침 이후에도 남긴다). 저널만 단독으로 쓰기 때문에,
 * 도메인 값과 원자적으로 함께 커밋해야 하는 app-store.js의 commitBatch는 이 함수
 * 대신 아래 planDirtyWrite()를 쓴다(계산만 하고 쓰기는 호출부에 맡긴다).
 * @param {string} ownerKey
 * @param {string} domain
 */
export function markDirty(ownerKey, domain) {
  const { value } = planDirtyWrite(ownerKey, [domain])
  writeJournal(ownerKey, value)
}

/**
 * commitBatch가 도메인 값과 저널을 한 번의 writeAllOrNothing으로 묶도록, 다음 저널 값만 계산해 { key, value }로 돌려준다(여기서는 쓰지 않는다).
 * @param {string} ownerKey
 * @param {Array<string>} domains 이번 배치에서 dirty로 표시할 domain들(중복 가능)
 * @returns {{ key: string, value: Record<string, number> }}
 */
export function planDirtyWrite(ownerKey, domains) {
  const journal = readJournal(ownerKey)
  const next = { ...journal }
  domains.forEach((domain) => {
    next[domain] = (next[domain] || 0) + 1
  })
  return { key: journalKey(ownerKey), value: next }
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
