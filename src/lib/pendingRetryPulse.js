// @ts-check
// 재감사 11차 — pending 큐가 생겼거나 비었을 때 retry 리스너가 타이머를
// 켜고 끄도록 알린다. setInterval을 상시 돌리면 큐가 빈 뒤에도 핸들이 남아
// 테스트 프로세스가 종료되지 않는다. unsafe-only는 타이머 대상이 아니다.
/** @type {() => void} */
let pulse = () => {}

/** @param {() => void} fn */
export function setPendingRetryPulse(fn) {
  pulse = fn
}

export function pulsePendingRetry() {
  pulse()
}
