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

/**
 * Step 0-4 감사 보완 4차(사용자 지시 6번): key 하나만 강제로 제거한다. 로그아웃 시점에
 * 같은 owner의 hydrate가 아직 진행 중이었다면, 바로 이어지는 재로그인(같은 owner)이
 * singleFlight로 "합류"해서 그 오래된(로그아웃 이전) 요청의 결과를 그대로 받아버리는
 * 사고를 막는다 — 로그아웃 시 그 owner의 in-flight 항목을 지도에서 지워 두면, 재로그인의
 * hydrateFromSupabase 호출이 새 factory를 진짜로 실행한다. 지워진 뒤에도 원래 Promise
 * 자체는 계속 실행되고 끝까지 가지만(취소 불가), 그 결과를 받는 사람은 이제 아무도 없고
 * hydrate 내부의 세대(epoch) 검사가 그 결과를 알아서 버린다.
 * @param {string} key
 */
export function evict(key) {
  inFlight.delete(key)
}
