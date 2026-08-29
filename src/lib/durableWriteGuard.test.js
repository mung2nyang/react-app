// @ts-check
// 재감사 10차(FAIL 지적 2번) — registerPendingDayWrite가 dateKey/patch 계약 위반으로
// 접수 자체를 거부하면(useDayDraft.js가 그 반환값을 무시하면 안 된다는 방어적 요구),
// 그 최신 draft는 durable에도 fallback에도 전혀 안 남는다. durableWriteGuard.js에 새로
// 추가된 markUnsafeRegistrationFailure/clearUnsafeRegistrationFailure/isDurableWriteBroken이
// 이 경우를 실제로 broken으로 표시하고, 성공 시 다시 healthy로 되돌리는지 이 파일에서
// 직접 검증한다 — pendingWorkDataWrites.js의 다른 owner/fallback 상태를 전혀 건드리지
// 않는 새 프로세스(별도 파일)에서 검증해 전역 오염(다른 테스트가 남긴 broken owner)
// 없이 정확한 before/after를 관찰할 수 있게 한다.
// 재감사 11차 hang: pendingWorkDataWrites → app-store가 실제 supabaseClient의
// realtime/auth 타이머를 붙잡는다. stub을 다른 import보다 먼저 올려야
// `--test-force-exit` 없이 프로세스가 스스로 끝난다.
import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const {
  clearUnsafeRegistrationFailure, confirmLeaveIfUnsafe, guardBeforeUnload, getUnsafeRegistrationPatch,
  hasAnyUnsafeRegistration, hasUnsafeRegistration, isDurableWriteBroken, listUnsafeRegistrations,
  markUnsafeRegistrationFailure,
} = await import('./durableWriteGuard.js')
const { registerPendingDayWrite, retryPendingDayWrites } = await import('./pendingWorkDataWrites.js')

/** @type {import('./pendingWorkDataWritesTypes.js').EffectivePatch} */
const invalidPatch = {
  isOff: false,
  fixedCount: 4,
  palletCount: 1,
  callDetails: [{ id: 'trp-unsafe', fare: '10,000', client: '한진', payments: [{ amount: 'oops' }] }],
  fixedRouteCounts: {},
}

/** @type {import('./pendingWorkDataWritesTypes.js').EffectivePatch} */
const validPatch = { isOff: false, fixedCount: 4, palletCount: 1, callDetails: [], fixedRouteCounts: {} }

test('이 프로세스는 아직 아무 owner도 건드리지 않았으니 시작 시점엔 healthy다', () => {
  assert.equal(isDurableWriteBroken(), false, '아무 등록도 안 했는데 broken이면 다른 테스트 오염이거나 초기값이 잘못됐다')
})

test('markUnsafeRegistrationFailure를 부르면 fallback/durable이 전혀 없어도 broken으로 바뀐다', () => {
  markUnsafeRegistrationFailure('guard-owner-a', '2026-09-21', invalidPatch)
  assert.equal(isDurableWriteBroken(), true, 'registerPendingDayWrite가 거부한 draft가 메모리에도 안 남으면 안 된다')
  assert.equal(hasUnsafeRegistration('guard-owner-a', '2026-09-21'), true, 'owner/date 단위로 unsafe가 기록돼야 한다')

  const event = { preventDefault: () => { event.prevented = true }, returnValue: undefined, prevented: false }
  guardBeforeUnload(event)
  assert.equal(event.prevented, true, 'broken인데 beforeunload를 막지 않으면 새로고침/탭닫기로 그대로 잃어버린다')
  assert.equal(event.returnValue, true)

  clearUnsafeRegistrationFailure('guard-owner-a', '2026-09-21')
  assert.equal(isDurableWriteBroken(), false, '이후 직접 커밋이 성공해 clear를 부르면 다시 healthy로 돌아와야 한다')
})

test('서로 다른 owner/date를 따로 추적한다 — 하나만 지워도 나머지는 계속 broken이다', () => {
  markUnsafeRegistrationFailure('guard-owner-b', '2026-09-22', invalidPatch)
  markUnsafeRegistrationFailure('guard-owner-c', '2026-09-23', invalidPatch)
  assert.equal(isDurableWriteBroken(), true)

  clearUnsafeRegistrationFailure('guard-owner-b', '2026-09-22')
  assert.equal(isDurableWriteBroken(), true, 'owner-c는 아직 안 지웠으니 계속 broken이어야 한다')

  clearUnsafeRegistrationFailure('guard-owner-c', '2026-09-23')
  assert.equal(isDurableWriteBroken(), false, '둘 다 지웠으니 healthy로 돌아와야 한다')
})

test('같은 owner/date를 다시 mark하면(연속 실패) clear 한 번으로 지워진다 — 키가 최신 값으로 덮인다', () => {
  markUnsafeRegistrationFailure('guard-owner-d', '2026-09-24', invalidPatch)
  markUnsafeRegistrationFailure('guard-owner-d', '2026-09-24', { ...invalidPatch, fixedCount: 9 })
  assert.equal(getUnsafeRegistrationPatch('guard-owner-d', '2026-09-24')?.fixedCount, 9, '같은 owner/date는 최신 patch가 승리해야 한다')
  assert.equal(listUnsafeRegistrations().length, 1)

  clearUnsafeRegistrationFailure('guard-owner-d', '2026-09-24')
  assert.equal(isDurableWriteBroken(), false, '같은 키를 두 번 mark해도 한 번의 clear로 완전히 지워져야 한다(Map이 새 엔트리를 추가하는 게 아니라 같은 키를 덮어써야 한다)')
})

test('broken 상태에서 confirmLeaveIfUnsafe는 window.confirm을 거쳐 사용자 선택을 그대로 돌려준다', () => {
  markUnsafeRegistrationFailure('guard-owner-e', '2026-09-25', invalidPatch)
  const originalConfirm = window.confirm
  try {
    window.confirm = () => false
    assert.equal(confirmLeaveIfUnsafe(), false, '사용자가 "취소"를 고르면 이동을 막아야 한다')
    window.confirm = () => true
    assert.equal(confirmLeaveIfUnsafe(), true, '사용자가 "그래도 이동"을 고르면 이동을 허용해야 한다')
  } finally {
    window.confirm = originalConfirm
    clearUnsafeRegistrationFailure('guard-owner-e', '2026-09-25')
  }
  assert.equal(isDurableWriteBroken(), false)
})

test('재감사 11차 — owner A unsafe가 남은 동안 owner B 큐 성공으로 경고가 꺼지지 않는다', () => {
  markUnsafeRegistrationFailure('guard-owner-a-keep', '2026-09-21', invalidPatch)
  const registeredB = registerPendingDayWrite('guard-owner-b-ok', '2026-09-22', validPatch)
  assert.equal(registeredB, true)
  assert.equal(isDurableWriteBroken(), true, 'A의 unsafe가 있으면 B 성공으로 전체가 healthy가 되면 안 된다')
  assert.equal(getUnsafeRegistrationPatch('guard-owner-a-keep', '2026-09-21')?.fixedCount, 4)
  assert.equal(hasAnyUnsafeRegistration(), true)
  retryPendingDayWrites()
  assert.equal(hasAnyUnsafeRegistration(), true, 'pending retry가 invalid unsafe를 승격·해제하면 안 된다')
  clearUnsafeRegistrationFailure('guard-owner-a-keep', '2026-09-21')
  assert.equal(isDurableWriteBroken(), false)
})

test('재감사 16차 — unsafe-only는 beforeunload와 confirmLeave 방어만 하고 retry로는 안 지워진다', () => {
  markUnsafeRegistrationFailure('guard-unsafe-only', '2026-10-06', invalidPatch)
  assert.equal(hasAnyUnsafeRegistration(), true)
  const event = { preventDefault: () => { event.prevented = true }, returnValue: undefined, prevented: false }
  guardBeforeUnload(event)
  assert.equal(event.prevented, true)
  const originalConfirm = window.confirm
  try {
    window.confirm = () => false
    assert.equal(confirmLeaveIfUnsafe(), false)
  } finally {
    window.confirm = originalConfirm
  }
  retryPendingDayWrites()
  assert.equal(hasUnsafeRegistration('guard-unsafe-only', '2026-10-06'), true, 'retry가 unsafe를 지우면 안 된다')
  clearUnsafeRegistrationFailure('guard-unsafe-only', '2026-10-06')
})
