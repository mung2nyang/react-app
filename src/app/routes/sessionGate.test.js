import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveSessionGate } from './sessionGate.js'

describe('resolveSessionGate — 비로그인 딥링크 차단', () => {
  test('부트 중이면 세션 유무와 무관하게 loading', () => {
    assert.equal(resolveSessionGate({ booting: true, session: null }), 'loading')
    assert.equal(resolveSessionGate({ booting: true, session: { userId: 'u1' } }), 'loading')
  })

  test('부트가 끝났는데 세션이 없으면 redirect — /app/day/:date 같은 딥링크를 막는다', () => {
    assert.equal(resolveSessionGate({ booting: false, session: null }), 'redirect')
    assert.equal(resolveSessionGate({ booting: false, session: null, guestModePersisted: false }), 'redirect')
  })

  test('부트가 끝났고 게스트 플래그만 있어도 allow', () => {
    assert.equal(resolveSessionGate({ booting: false, session: null, guestModePersisted: true }), 'allow')
  })

  test('부트가 끝났고 세션(게스트 포함)이 있으면 allow', () => {
    assert.equal(resolveSessionGate({ booting: false, session: { guestMode: true } }), 'allow')
    assert.equal(resolveSessionGate({ booting: false, session: { userId: 'u1' } }), 'allow')
  })
})
