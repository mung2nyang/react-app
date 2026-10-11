// @ts-check
// 던지는 시점부터 전용 Error 클래스를 써서, 호출부가 instanceof StaleSessionError처럼 바로 구분한다.

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
