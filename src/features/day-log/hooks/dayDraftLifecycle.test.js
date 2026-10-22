// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settlePendingDayWrite } from './dayDraftLifecycle.js'

test('재감사 13차 — 성공한 stale revision은 pending/UI를 유지한다', () => {
  const progress = { hasPending: true, draftRev: 2, mounted: true }
  /** @type {'idle'|'pending'|'saved'|'failed'} */
  let status = 'pending'
  settlePendingDayWrite(progress, (next) => { status = next }, 1, true)
  assert.equal(progress.hasPending, true, '더 최신 draft가 있으면 pending을 내리면 안 된다')
  assert.equal(status, 'pending', '최신 B를 저장됨으로 오인하면 안 된다')
})

test('재감사 13차 — 최신 revision 성공만 pending을 내리고 UI를 saved로 바꾼다', () => {
  const progress = { hasPending: true, draftRev: 1, mounted: true }
  /** @type {'idle'|'pending'|'saved'|'failed'} */
  let status = 'pending'
  settlePendingDayWrite(progress, (next) => { status = next }, 1, true)
  assert.equal(progress.hasPending, false)
  assert.equal(status, 'saved')
})

test('재감사 13차 — ok=false면 pending을 건드리지 않는다', () => {
  const progress = { hasPending: true, draftRev: 1, mounted: true }
  /** @type {'idle'|'pending'|'saved'|'failed'} */
  let status = 'failed'
  settlePendingDayWrite(progress, (next) => { status = next }, 1, false)
  assert.equal(progress.hasPending, true)
  assert.equal(status, 'failed')
})
