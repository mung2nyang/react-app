import { resetStubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const {
  assertCloudWriteReady,
  beginSessionEpoch,
  blockedReasonForCloudWrite,
  captureSession,
  endCloudSession,
  isCloudSession,
  isSessionStillCurrent,
} = await import('./cloudSession.js')
const { setHydration, getState } = await import('../store/app-store.js')

describe('isCloudSession', () => {
  test('userId가 있고 guestMode가 아니면 true', () => {
    assert.equal(isCloudSession({ userId: 'u1', guestMode: false }), true)
  })
  test('guestMode면 false, userId가 없어도 false', () => {
    assert.equal(isCloudSession({ userId: 'u1', guestMode: true }), false)
    assert.equal(isCloudSession({ guestMode: false }), false)
    assert.equal(isCloudSession(null), false)
  })
})

describe('assertCloudWriteReady / blockedReasonForCloudWrite', () => {
  test('세션이 없으면 던진다("로그인이 필요합니다")', () => {
    resetStubSupabaseCallCounts()
    endCloudSession()
    assert.throws(() => assertCloudWriteReady(), /로그인이 필요합니다/)
    assert.equal(blockedReasonForCloudWrite('some-cloud-id'), '로그인이 필요합니다.')
  })

  test('세션은 있는데 hydration이 ready가 아니면 던진다', () => {
    beginSessionEpoch('user-x', 'owner-x')
    setHydration({ status: 'hydrating', userId: 'user-x', ownerKey: 'owner-x' })
    assert.throws(() => assertCloudWriteReady(), /준비되지 않았습니다/)
    assert.ok(blockedReasonForCloudWrite('some-cloud-id'))
    endCloudSession()
  })

  test('ready 상태면 통과한다', () => {
    beginSessionEpoch('user-y', 'owner-y')
    setHydration({ status: 'ready', userId: 'user-y', ownerKey: 'owner-y' })
    assert.doesNotThrow(() => assertCloudWriteReady())
    assert.equal(blockedReasonForCloudWrite('some-cloud-id'), null)
    endCloudSession()
  })

  test('cloudId가 없으면(로컬 전용 레코드) hydration 상태와 무관하게 항상 허용한다', () => {
    endCloudSession() // idle
    assert.equal(blockedReasonForCloudWrite(null), null)
    assert.equal(blockedReasonForCloudWrite(undefined), null)
    assert.equal(blockedReasonForCloudWrite(''), null)
  })
})

describe('captureSession / isSessionStillCurrent — 세대(epoch) 재검증', () => {
  test('캡처 직후에는 여전히 현재 세션이다', () => {
    beginSessionEpoch('user-z', 'owner-z')
    const captured = captureSession()
    assert.equal(isSessionStillCurrent(captured), true)
    endCloudSession()
  })

  test('그 사이 새 세션이 시작되면(세대가 올라가면) 더 이상 현재 세션이 아니다', () => {
    beginSessionEpoch('user-1', 'owner-1')
    const captured = captureSession()
    beginSessionEpoch('user-2', 'owner-2')
    assert.equal(isSessionStillCurrent(captured), false)
    endCloudSession()
  })

  test('로그아웃(endCloudSession)도 세대를 올려 이전 캡처를 무효화한다', () => {
    beginSessionEpoch('user-3', 'owner-3')
    const captured = captureSession()
    endCloudSession()
    assert.equal(isSessionStillCurrent(captured), false)
  })
})

describe('endCloudSession', () => {
  test('hydration을 idle로 되돌리고 userId/ownerKey를 비운다', () => {
    beginSessionEpoch('user-4', 'owner-4')
    setHydration({ status: 'ready', userId: 'user-4', ownerKey: 'owner-4' })
    endCloudSession()
    assert.equal(getState().hydration.status, 'idle')
    assert.equal(getState().hydration.userId, null)
    assert.equal(getState().hydration.ownerKey, null)
  })
})
