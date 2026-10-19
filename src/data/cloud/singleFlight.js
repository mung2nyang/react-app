// restoreSessionOnBoot()/hydrateFromSupabase()를 owner별 single-flight로 — StrictMode가 두 번 불러도 실제 요청은 한 번.
const inFlight = new Map()

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} factory
 * @returns {Promise<T>}
 */
export function singleFlight(key, factory) {
  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key)
    })
  inFlight.set(key, promise)
  return promise
}

/** 테스트 전용: 다음 singleFlight 호출이 새 요청으로 취급되도록 비운다. */
export function resetSingleFlightForTests() {
  inFlight.clear()
}

/**
 * key 하나를 강제로 지운다 — 로그아웃 때 그 owner의 진행 중 hydrate를 지워 두면 재로그인이 옛 요청에 합류하지 않고 새로 시작한다.
 * 옛 Promise는 끝까지 돌지만 결과는 세대(epoch) 검사가 버린다.
 * @param {string} key
 */
export function evict(key) {
  inFlight.delete(key)
}
