// Step 0-4 감사 보완 2차: restoreSessionOnBoot()/hydrateFromSupabase()를 owner별로
// single-flight로 만든다. 같은 key로 다시 부르면 새 요청을 또 안 띄우고 이미 도는
// Promise를 그대로 돌려준다 — StrictMode가 이펙트를 두 번 실행해도 세션 조회/hydrate가
// 실제로는 한 번만 나간다.
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
