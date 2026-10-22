// 저장 중 세션이 바뀜·영구 실패 같은 오류 종류 — 부르는 쪽이 종류로 나눠 안내한다.

/** 세션이 바뀌어 남은 원격 작업을 중단할 때 던진다(cloudSession.ts). */
export class StaleSessionError extends Error {
  constructor(message = '세션이 바뀌어 남은 원격 작업을 중단합니다.') {
    super(message)
    this.name = 'StaleSessionError'
  }
}

/** 재시도해도 결과가 같은 확정 validation 실패일 때 던진다. */
export class PermanentFailureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentFailureError'
  }
}
