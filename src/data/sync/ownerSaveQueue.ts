// 같은 owner의 로그인 저장을 한 줄로 세운다 — 겹치면 두 번째가 첫 insert 전에 조회해 같은 행을 두 번 넣는다(재시도 큐 아님).
const chains: Map<string, Promise<void>> = new Map()

export function runOwnerSaveSerialized<T>(ownerKey: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(ownerKey) || Promise.resolve()
  const run = prev.then(task, task)
  chains.set(ownerKey, run.then(() => undefined, () => undefined))
  return run
}

/** 테스트 격리용 — owner별 저장 직렬화 체인을 비운다. */
export function resetOwnerSaveQueueForTests() {
  chains.clear()
}
