// @ts-check
// 슬라이스 E: 로그인 저장은 서버 직접 1회다. 같은 owner에 저장이 겹치면 두 번째가
// 첫 insert 전에 조회해 같은 행을 두 번 넣을 수 있다. owner별 한 줄 직렬화
// (재시도 큐가 아님).
/** @type {Map<string, Promise<void>>} */
const chains = new Map()

/**
 * @template T
 * @param {string} ownerKey
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function runOwnerSaveSerialized(ownerKey, task) {
  const prev = chains.get(ownerKey) || Promise.resolve()
  const run = prev.then(task, task)
  chains.set(ownerKey, run.then(() => undefined, () => undefined))
  return run
}

/** 테스트 격리용 — owner별 저장 직렬화 체인을 비운다. */
export function resetOwnerSaveQueueForTests() {
  chains.clear()
}
