// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settlePendingDayWrite } from './dayDraftLifecycle.js'

test('재감사 13차 — 성공한 stale revision은 onCommitted만 하고 pending/UI는 유지한다', () => {
  const hasPendingRef = { current: true }
  const mountedRef = { current: true }
  /** @type {'idle'|'pending'|'saved'|'failed'} */
  let status = 'pending'
  let committed = 0
  const onCommittedRef = { current: () => { committed += 1 } }
  const draftRevRef = { current: 2 }
  settlePendingDayWrite(hasPendingRef, mountedRef, (next) => { status = next }, onCommittedRef, draftRevRef, 1, true)
  assert.equal(committed, 1, '실제로 커밋된 A의 onCommitted는 1회여야 한다')
  assert.equal(hasPendingRef.current, true, '더 최신 draft가 있으면 pending을 내리면 안 된다')
  assert.equal(status, 'pending', '최신 B를 저장됨으로 오인하면 안 된다')
})

test('재감사 13차 — 최신 revision 성공만 pending을 내리고 UI를 saved로 바꾼다', () => {
  const hasPendingRef = { current: true }
  const mountedRef = { current: true }
  /** @type {'idle'|'pending'|'saved'|'failed'} */
  let status = 'pending'
  let committed = 0
  const onCommittedRef = { current: () => { committed += 1 } }
  const draftRevRef = { current: 1 }
  settlePendingDayWrite(hasPendingRef, mountedRef, (next) => { status = next }, onCommittedRef, draftRevRef, 1, true)
  assert.equal(committed, 1)
  assert.equal(hasPendingRef.current, false)
  assert.equal(status, 'saved')
})

test('재감사 13차 — ok=false면 onCommitted도 pending도 건드리지 않는다', () => {
  const hasPendingRef = { current: true }
  const mountedRef = { current: true }
  /** @type {'idle'|'pending'|'saved'|'failed'} */
  let status = 'failed'
  let committed = 0
  const onCommittedRef = { current: () => { committed += 1 } }
  const draftRevRef = { current: 1 }
  settlePendingDayWrite(hasPendingRef, mountedRef, (next) => { status = next }, onCommittedRef, draftRevRef, 1, false)
  assert.equal(committed, 0)
  assert.equal(hasPendingRef.current, true)
  assert.equal(status, 'failed')
})
