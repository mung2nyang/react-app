// @ts-check
// 재감사 항목 3 — catch(error)에서 error가 unknown일 때마다 매번 unknown 매개변수를
// 받는 타입가드 함수로 좁히는 대신, 애초에 던지는 시점부터 전용 Error 서브클래스를
// 쓴다. 호출부는 표준 `error instanceof StaleSessionError` 식으로 바로 구분할 수
// 있어 unknown 타입 자체가 코드 어디에도 등장하지 않는다.

/** 세션이 바뀌어 남은 원격 작업을 중단할 때 던진다(cloudSession.js). */
export class StaleSessionError extends Error {
  /** @param {string} [message] */
  constructor(message = '세션이 바뀌어 남은 원격 작업을 중단합니다.') {
    super(message)
    this.name = 'StaleSessionError'
  }
}

/** 재시도해도 결과가 같은 확정 validation 실패일 때 던진다(mutationOutbox.js/outboxFlush.js). */
export class PermanentFailureError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'PermanentFailureError'
  }
}
