import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  clearGuestModePersisted,
  GUEST_APP_SESSION,
  isGuestModePersisted,
  setGuestModePersisted,
} from './guestSessionPersist.js'

describe('guestSessionPersist — localStorage 게스트 플래그', () => {
  test('setGuestModePersisted(true) 후 isGuestModePersisted === true', () => {
    clearGuestModePersisted()
    assert.equal(isGuestModePersisted(), false)
    setGuestModePersisted(true)
    assert.equal(isGuestModePersisted(), true)
    clearGuestModePersisted()
    assert.equal(isGuestModePersisted(), false)
  })

  test('clearGuestModePersisted는 로그인 전환 시 플래그를 지운다', () => {
    setGuestModePersisted(true)
    clearGuestModePersisted()
    assert.equal(isGuestModePersisted(), false)
  })

  test('GUEST_APP_SESSION은 guestMode:true 세션 형태다', () => {
    assert.equal(GUEST_APP_SESSION.guestMode, true)
    assert.equal(GUEST_APP_SESSION.name, '비회원')
  })
})
