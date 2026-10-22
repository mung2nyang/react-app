// @ts-check
// 로드맵 72 — 열린 일지 목록과 새로고침·앱 닫기 확인.
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const { flushDayDrafts, hasBusyDayDraft, pruneDayDraft, registerDayDraft, releaseDayDraft } = await import('./dayDraftActivity.ts')
const { confirmReloadIfUnsaved, guardBeforeUnload } = await import('./durableWriteGuard.ts')

const SAVING_MESSAGE = '방금 고친 내용을 아직 저장하는 중입니다. 그래도 나가시겠습니까?'

/** 비회원처럼: 지금 저장하면 그 자리에서 끝난다. */
function guestDraft() {
  const state = { waiting: true, flushes: 0 }
  const token = registerDayDraft(() => state.waiting, () => { state.flushes += 1; state.waiting = false })
  return { state, token }
}

/** 로그인처럼: 지금 저장해도 서버 응답 전까지 저장 중. */
function cloudDraft() {
  const state = { waiting: true, saving: false, flushes: 0 }
  const token = registerDayDraft(() => state.waiting || state.saving, () => { state.flushes += 1; state.waiting = false; state.saving = true })
  return { state, token }
}

/** @returns {{ prevented: boolean, preventDefault: () => void, returnValue?: boolean }} */
function unloadEvent() {
  const event = { prevented: false, preventDefault() { event.prevented = true } }
  return event
}

test('72-1: 화면 숨김·pagehide 때 기다리던 저장만 바로 시작한다', () => {
  const waiting = guestDraft()
  const idle = guestDraft()
  idle.state.waiting = false
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new window.Event('visibilitychange'))
    assert.equal(waiting.state.flushes, 1)
    assert.equal(idle.state.flushes, 0, '기다리는 게 없으면 저장하지 않는다')

    waiting.state.waiting = true
    window.dispatchEvent(new window.Event('pagehide'))
    assert.equal(waiting.state.flushes, 2)
  } finally {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    for (const draft of [waiting, idle]) { draft.state.waiting = false; releaseDayDraft(draft.token) }
  }
})

test('72-2: 비회원 새로고침 — 그 자리에서 저장하고 확인 창 없이 통과', () => {
  const draft = guestDraft()
  const confirmSpy = mock.method(window, 'confirm', () => false)
  try {
    const event = unloadEvent()
    guardBeforeUnload(event)
    assert.equal(draft.state.flushes, 1)
    assert.equal(event.prevented, false)
    assert.equal(confirmReloadIfUnsaved(), true)
    assert.equal(confirmSpy.mock.callCount(), 0)
  } finally {
    confirmSpy.mock.restore()
    releaseDayDraft(draft.token)
  }
})

test('72-3: 로그인 저장 중 — 브라우저 새로고침은 막고, 당겨서 새로고침·로그아웃은 저장 중 문구로 묻는다', () => {
  const draft = cloudDraft()
  /** @type {Array<string>} */
  const asked = []
  const confirmSpy = mock.method(window, 'confirm', (/** @type {string} */ message) => { asked.push(message); return false })
  try {
    const event = unloadEvent()
    guardBeforeUnload(event)
    assert.equal(draft.state.flushes, 1, '막기 전에 저장을 시작한다')
    assert.equal(event.prevented, true)
    assert.equal(confirmReloadIfUnsaved(), false, '취소하면 남는다')
    assert.deepEqual(asked, [SAVING_MESSAGE])
  } finally {
    confirmSpy.mock.restore()
    draft.state.saving = false
    releaseDayDraft(draft.token)
  }
})

test('72-4: 저장이 끝나면 확인 없이 통과, 닫힌 화면은 저장이 끝날 때까지 목록에 남는다', () => {
  const draft = cloudDraft()
  flushDayDrafts()
  releaseDayDraft(draft.token)
  assert.equal(hasBusyDayDraft(), true, '화면이 닫혀도 서버 저장 중이면 남는다')

  draft.state.saving = false
  pruneDayDraft(draft.token)
  assert.equal(hasBusyDayDraft(), false)
  const event = unloadEvent()
  guardBeforeUnload(event)
  assert.equal(event.prevented, false)
})
