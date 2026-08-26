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
 * Step 0-4 감사 보완 3차: commitBatch가 도메인 값 쓰기와 저널 쓰기를 하나의
 * writeAllOrNothing 호출로 묶을 수 있도록, "다음 저널 값"만 메모리에서 계산해
 * { key, value } 쌍으로 돌려준다 — 여기서는 아무것도 쓰지 않는다. 이전엔 markDirty가
 * 도메인 값 쓰기와 별도로 자기 localStorage.setItem을 호출해서, 그 호출이 도중에
 * 실패하면(용량 초과 등) 도메인은 이미 새 값으로 남았는데 저널은 갱신 안 된(혹은 그
 * 반대) 불일치가 생길 수 있었다.
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
