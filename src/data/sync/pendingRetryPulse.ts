// pending 큐가 생기거나 비면 retry 리스너가 타이머를 켜고 끈다 — 상시 setInterval은 큐가 빈 뒤에도 남아 테스트 프로세스가 안 끝난다(unsafe-only는 대상 아님).
let pulse: () => void = () => {}

export function setPendingRetryPulse(fn: () => void) {
  pulse = fn
}

export function pulsePendingRetry() {
  pulse()
}
