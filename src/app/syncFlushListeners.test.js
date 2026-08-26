import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { attachSyncFlushListeners } from './syncFlushListeners.js'

/** addEventListener/removeEventListener 호출을 세는 가짜 이벤트 타깃. */
function fakeEventTarget() {
  const listeners = new Map() // type -> Set<fn>
  return {
    hidden: false,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(fn)
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn)
    },
    countFor(type) {
      return listeners.get(type)?.size || 0
    },
    totalCount() {
      let total = 0
      listeners.forEach((set) => { total += set.size })
      return total
    },
  }
}

describe('attachSyncFlushListeners — StrictMode 리스너 cleanup', () => {
  test('등록한 3개(online/visibilitychange/pagehide)를 cleanup이 정확히 제거한다', () => {
    const win = fakeEventTarget()
    const doc = fakeEventTarget()
    const cleanup = attachSyncFlushListeners(win, doc)

    assert.equal(win.countFor('online'), 1)
    assert.equal(win.countFor('pagehide'), 1)
    assert.equal(doc.countFor('visibilitychange'), 1)

    cleanup()

    assert.equal(win.totalCount(), 0)
    assert.equal(doc.totalCount(), 0)
  })

  test('StrictMode처럼 마운트→cleanup→마운트를 반복해도 리스너가 누적되지 않는다', () => {
    const win = fakeEventTarget()
    const doc = fakeEventTarget()

    const cleanup1 = attachSyncFlushListeners(win, doc)
    cleanup1()
    const cleanup2 = attachSyncFlushListeners(win, doc)

    // 두 번째 마운트 이후에도 각 타입당 정확히 1개만 남아야 한다 — cleanup1이 자기가 단
    // 리스너만 정확히 지웠고, cleanup2가 새로 단 리스너와 뒤섞이지 않았다는 뜻이다.
    assert.equal(win.countFor('online'), 1)
    assert.equal(win.countFor('pagehide'), 1)
    assert.equal(doc.countFor('visibilitychange'), 1)

    cleanup2()
    assert.equal(win.totalCount(), 0)
    assert.equal(doc.totalCount(), 0)
  })
})
