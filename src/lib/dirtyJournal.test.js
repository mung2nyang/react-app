import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { markDirty, hasDirty, getDirtyDomains, clearDirty } from './dirtyJournal.js'

describe('dirtyJournal — durable per-owner 저널', () => {
  test('markDirty 전에는 dirty가 아니다', () => {
    assert.equal(hasDirty('journal-owner-1'), false)
    assert.deepEqual(getDirtyDomains('journal-owner-1'), [])
  })

  test('markDirty 후에는 hasDirty가 true, 그 domain이 getDirtyDomains에 나온다', () => {
    markDirty('journal-owner-2', 'cars')
    assert.equal(hasDirty('journal-owner-2'), true)
    assert.deepEqual(getDirtyDomains('journal-owner-2'), ['cars'])
  })

  test('localStorage에 직접 저장돼 "새로고침"(같은 프로세스에서 다시 읽기) 후에도 남는다', () => {
    markDirty('journal-owner-3', 'profile')
    const raw = localStorage.getItem('reactPracticeDirtyJournal:journal-owner-3')
    assert.ok(raw, '저널이 localStorage에 저장돼 있어야 한다')
    assert.deepEqual(JSON.parse(raw), { profile: 1 })
  })

  test('clearDirty 후에는 다시 dirty가 아니다', () => {
    markDirty('journal-owner-4', 'expenses')
    assert.equal(hasDirty('journal-owner-4'), true)
    clearDirty('journal-owner-4')
    assert.equal(hasDirty('journal-owner-4'), false)
    assert.deepEqual(getDirtyDomains('journal-owner-4'), [])
  })

  test('owner별로 독립적이다 — 한 owner를 지워도 다른 owner는 영향 없다', () => {
    markDirty('journal-owner-5a', 'cars')
    markDirty('journal-owner-5b', 'cars')
    clearDirty('journal-owner-5a')
    assert.equal(hasDirty('journal-owner-5a'), false)
    assert.equal(hasDirty('journal-owner-5b'), true)
  })

  test('같은 domain을 여러 번 markDirty하면 revision이 누적된다', () => {
    markDirty('journal-owner-6', 'cars')
    markDirty('journal-owner-6', 'cars')
    markDirty('journal-owner-6', 'cars')
    const raw = JSON.parse(localStorage.getItem('reactPracticeDirtyJournal:journal-owner-6'))
    assert.equal(raw.cars, 3)
  })
})
