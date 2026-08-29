// @ts-check
// 재감사 3차(FAIL 지적 2번) — attachPendingWriteRetryListeners가 (1) 붙는 즉시 한 번
// 재시도하고(reload 복구), (2) online/beforeunload/타이머를 전부 정확히 등록·해제하는지
// (listener cleanup) 실측한다. app-store.test.js와 같은 이유로 mock.module은 파일당
// 한 번만 등록하고(모듈은 한 번만 링크된다), 이후 각 테스트는 그 mock의 내부 함수
// 자체를 바꿔치기하는 방식으로 서로 다른 시나리오를 만든다 — 테스트마다 다시
// mock.module + 재-import를 하면 이미 링크된 모듈은 최초 mock에 그대로 묶여 있어
// 새 mock이 반영되지 않는다.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

/** @typedef {(event: Event) => void} WindowListener */

/** @type {() => boolean} */
let hasPendingDayWritesImpl = () => false
/** @type {() => boolean} */
let hasAnyUnsafeRegistrationImpl = () => false
/** @type {() => void} */
let retryPendingDayWritesFn = () => {}
/** @type {(event: Event) => void} */
let guardBeforeUnloadFn = () => {}

mock.module('../lib/pendingWorkDataWrites.js', {
  exports: {
    hasPendingDayWrites: () => hasPendingDayWritesImpl(),
    retryPendingDayWrites: () => { retryPendingDayWritesFn() },
    registerPendingDayWrite: () => false,
  },
})
mock.module('../lib/durableWriteGuard.js', {
  exports: {
    guardBeforeUnload: (/** @type {Event} */ event) => { guardBeforeUnloadFn(event) },
    hasAnyUnsafeRegistration: () => hasAnyUnsafeRegistrationImpl(),
  },
})

const { attachPendingWriteRetryListeners } = await import('./pendingWriteRetryListeners.js')

function fakeWindowTarget() {
  /** @type {Record<string, Array<WindowListener>>} */
  const listeners = {}
  return {
    listeners,
    /**
     * @param {string} type
     * @param {WindowListener} fn
     */
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || []
      listeners[type].push(fn)
    },
    /**
     * @param {string} type
     * @param {WindowListener} fn
     */
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn)
    },
  }
}

test('attach 즉시 한 번 재시도한다 — reload 직후 durable 큐 복구', () => {
  hasPendingDayWritesImpl = () => true
  let retryCount = 0
  retryPendingDayWritesFn = () => { retryCount += 1 }
  const target = fakeWindowTarget()
  const cleanup = attachPendingWriteRetryListeners(target)
  try {
    assert.equal(retryCount, 1, '붙는 즉시(온라인 이벤트/5초를 기다리지 않고) 한 번 재시도해야 한다')
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

test('재감사 11차 — cleanup 후 interval이 retry를 더 부르지 않는다', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'], now: 0 })
  try {
    hasPendingDayWritesImpl = () => true
    let retryCount = 0
    retryPendingDayWritesFn = () => { retryCount += 1 }
    const target = fakeWindowTarget()
    const cleanup = attachPendingWriteRetryListeners(target)
    assert.equal(retryCount, 1, 'attach 직후 1회')
    cleanup()
    mock.timers.tick(30_000)
    assert.equal(retryCount, 1, 'cleanup 후 시간이 지나도 재시도하면 안 된다 — 이 테스트가 안 깨지면 interval 누수가 없다')
  } finally {
    mock.timers.reset()
  }
})

test('beforeunload가 실제로 오면 durableWriteGuard.guardBeforeUnload로 그대로 넘긴다', () => {
  hasPendingDayWritesImpl = () => false
  /** @type {Event | undefined} */
  let received
  guardBeforeUnloadFn = (event) => { received = event }
  const target = fakeWindowTarget()
  const cleanup = attachPendingWriteRetryListeners(target)
  const fakeEvent = new Event('beforeunload')
  const beforeunload = target.listeners.beforeunload?.[0]
  assert.ok(beforeunload, 'beforeunload 리스너가 있어야 한다')
  beforeunload(fakeEvent)
  cleanup()

  assert.equal(received, fakeEvent)
})

test('online 이벤트가 오면 큐가 있을 때만 retryPendingDayWrites를 부른다', () => {
  hasPendingDayWritesImpl = () => false
  let retryCount = 0
  retryPendingDayWritesFn = () => { retryCount += 1 }
  const target = fakeWindowTarget()
  const cleanup = attachPendingWriteRetryListeners(target)
  retryCount = 0
  const online = target.listeners.online?.[0]
  assert.ok(online, 'online 리스너가 있어야 한다')
  online(new Event('online'))
  assert.equal(retryCount, 0, '큐가 비어 있으면 online이 와도 재시도하면 안 된다')

  hasPendingDayWritesImpl = () => true
  online(new Event('online'))
  assert.equal(retryCount, 1, '큐가 있으면 online에서 재시도해야 한다')
  cleanup()
})

test('재감사 16차 — unsafe-only면 5초 interval과 retry가 시작되지 않고 beforeunload는 남는다', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'], now: 0 })
  try {
    let pendingChecks = 0
    hasPendingDayWritesImpl = () => {
      pendingChecks += 1
      return false
    }
    hasAnyUnsafeRegistrationImpl = () => true
    let retryCount = 0
    retryPendingDayWritesFn = () => { retryCount += 1 }
    const target = fakeWindowTarget()
    const cleanup = attachPendingWriteRetryListeners(target)
    const checksAfterAttach = pendingChecks
    assert.equal(retryCount, 0, 'unsafe만 있으면 attach 직후에도 retry하면 안 된다')
    assert.equal(target.listeners.beforeunload?.length, 1, 'unsafe-only여도 beforeunload 방어는 남아야 한다')
    const fakeEvent = new Event('beforeunload')
    /** @type {Event|undefined} */
    let received
    guardBeforeUnloadFn = (event) => { received = event }
    const beforeunload = target.listeners.beforeunload?.[0]
    assert.ok(beforeunload)
    beforeunload(fakeEvent)
    assert.equal(received, fakeEvent)
    mock.timers.tick(30_000)
    assert.equal(retryCount, 0, '5초 interval이 retry를 돌리면 안 된다')
    assert.equal(pendingChecks, checksAfterAttach, 'interval이 돌면 hasPending 검사가 늘어난다 — 돌면 안 된다')
    cleanup()
  } finally {
    hasAnyUnsafeRegistrationImpl = () => false
    mock.timers.reset()
  }
})
