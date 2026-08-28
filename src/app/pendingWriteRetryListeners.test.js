// 재감사 3차(FAIL 지적 2번) — attachPendingWriteRetryListeners가 (1) 붙는 즉시 한 번
// 재시도하고(reload 복구), (2) online/beforeunload/타이머를 전부 정확히 등록·해제하는지
// (listener cleanup) 실측한다. app-store.test.js와 같은 이유로 mock.module은 파일당
// 한 번만 등록하고(모듈은 한 번만 링크된다), 이후 각 테스트는 그 mock의 내부 함수
// 자체를 바꿔치기하는 방식으로 서로 다른 시나리오를 만든다 — 테스트마다 다시
// mock.module + 재-import를 하면 이미 링크된 모듈은 최초 mock에 그대로 묶여 있어
// 새 mock이 반영되지 않는다.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

let hasPendingDayWritesImpl = () => false
let retryPendingDayWritesFn = mock.fn()
let guardBeforeUnloadFn = mock.fn()

mock.module('../lib/pendingWorkDataWrites.js', {
  exports: {
    hasPendingDayWrites: (...args) => hasPendingDayWritesImpl(...args),
    retryPendingDayWrites: (...args) => retryPendingDayWritesFn(...args),
  },
})
mock.module('../lib/durableWriteGuard.js', {
  exports: { guardBeforeUnload: (...args) => guardBeforeUnloadFn(...args) },
})

const { attachPendingWriteRetryListeners } = await import('./pendingWriteRetryListeners.js')

// 재감사 10차(FAIL 지적 4번) — pendingWriteRetryListeners.js의 EventTargetLike가
// 실제로 약속하는 리스너 모양(addEventListener(type, listener: (event: Event) =>
// void))을 그대로 재사용한다. Function은 인자/반환값 정보를 전부 지워서 잘못된
// 인자로 불러도 컴파일타임에 못 잡는다 — 실제 계약과 똑같은 구체 타입으로 바꾼다.
/** @typedef {(event: Event) => void} WindowListener */

function fakeWindowTarget() {
  /** @type {Record<string, Array<WindowListener>>} */
  const listeners = {}
  return {
    listeners,
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || []
      listeners[type].push(fn)
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn)
    },
  }
}

test('attach 즉시 한 번 재시도한다 — reload 직후 durable 큐 복구', () => {
  hasPendingDayWritesImpl = () => true
  retryPendingDayWritesFn = mock.fn()
  const target = fakeWindowTarget()
  const cleanup = attachPendingWriteRetryListeners(target)
  try {
    assert.equal(retryPendingDayWritesFn.mock.callCount(), 1, '붙는 즉시(온라인 이벤트/5초를 기다리지 않고) 한 번 재시도해야 한다')
  } finally {
    cleanup()
  }
})

test('cleanup은 online/beforeunload 리스너와 타이머를 전부 정리한다', () => {
  hasPendingDayWritesImpl = () => false
  const target = fakeWindowTarget()
  const cleanup = attachPendingWriteRetryListeners(target)
  assert.equal(target.listeners.online?.length, 1, 'online 리스너가 등록돼야 한다')
  assert.equal(target.listeners.beforeunload?.length, 1, 'beforeunload 리스너가 등록돼야 한다')

  cleanup()
  assert.equal(target.listeners.online?.length, 0, 'cleanup 후 online 리스너가 남으면 안 된다')
  assert.equal(target.listeners.beforeunload?.length, 0, 'cleanup 후 beforeunload 리스너가 남으면 안 된다')
})

test('beforeunload가 실제로 오면 durableWriteGuard.guardBeforeUnload로 그대로 넘긴다', () => {
  hasPendingDayWritesImpl = () => false
  guardBeforeUnloadFn = mock.fn()
  const target = fakeWindowTarget()
  const cleanup = attachPendingWriteRetryListeners(target)
  const fakeEvent = { preventDefault: () => {} }
  target.listeners.beforeunload[0](fakeEvent)
  cleanup()

  assert.equal(guardBeforeUnloadFn.mock.callCount(), 1)
  assert.equal(guardBeforeUnloadFn.mock.calls[0].arguments[0], fakeEvent)
})

test('online 이벤트가 오면 큐가 있을 때만 retryPendingDayWrites를 부른다', () => {
  hasPendingDayWritesImpl = () => false
  retryPendingDayWritesFn = mock.fn()
  const target = fakeWindowTarget()
  const cleanup = attachPendingWriteRetryListeners(target)
  retryPendingDayWritesFn = mock.fn() // 위 attach 시점의 즉시-재시도 호출은 카운트에서 제외
  target.listeners.online[0]()
  assert.equal(retryPendingDayWritesFn.mock.callCount(), 0, '큐가 비어 있으면 online이 와도 재시도하면 안 된다')

  hasPendingDayWritesImpl = () => true
  target.listeners.online[0]()
  assert.equal(retryPendingDayWritesFn.mock.callCount(), 1, '큐가 있으면 online에서 재시도해야 한다')
  cleanup()
})
