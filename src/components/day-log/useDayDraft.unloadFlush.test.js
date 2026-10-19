// 로드맵 72 — 고친 직후(0.6초 대기 중) 앱을 닫거나 숨기면 기다리지 않고 바로 저장한다.
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { useDayDraft } = await import('./useDayDraft.js')
const { commitWorkData } = await import('../../data/store/commitHelpers.js')
const { readOwnerLogWorkData } = await import('../../data/store/ownerDataHooks.js')
const { confirmLeaveIfUnsafe, guardBeforeUnload } = await import('../../data/sync/durableWriteGuard.js')

const DK = '2026-10-22'

/** @param {string} ownerKey */
async function mount(ownerKey) {
  /** @type {{ current: ReturnType<typeof useDayDraft>|null }} */
  const latest = { current: null }
  function Harness() {
    latest.current = useDayDraft(ownerKey, DK)
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  return {
    latest,
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

test('72-5: 비회원이 고친 직후 pagehide면 0.6초를 기다리지 않고 기기에 저장한다', async () => {
  const ownerKey = 'guest-72-pagehide'
  commitWorkData(ownerKey, {})
  const view = await mount(ownerKey)
  try {
    await act(async () => { view.latest.current?.dispatch({ type: 'patchDraft', patch: { fixedCount: 3 } }) })
    assert.equal(readOwnerLogWorkData(ownerKey, 'main')[DK], undefined, '아직 0.6초 대기 중')
    await act(async () => { window.dispatchEvent(new window.Event('pagehide')) })
    assert.equal(readOwnerLogWorkData(ownerKey, 'main')[DK]?.fixedCount, 3)
  } finally {
    await view.unmount()
  }
})

test('72-6: 비회원이 고친 직후 새로고침 — 저장한 뒤 확인 없이 통과, 앱 안 이동 확인도 그대로', async () => {
  const ownerKey = 'guest-72-unload'
  commitWorkData(ownerKey, {})
  const view = await mount(ownerKey)
  const confirmSpy = mock.method(window, 'confirm', () => false)
  try {
    await act(async () => { view.latest.current?.dispatch({ type: 'patchDraft', patch: { fixedCount: 4 } }) })
    assert.equal(confirmLeaveIfUnsafe(), true, '앱 안 이동은 저장 대기만으로 묻지 않는다')
    const event = { prevented: false, preventDefault() { event.prevented = true } }
    await act(async () => { guardBeforeUnload(event) })
    assert.equal(event.prevented, false)
    assert.equal(readOwnerLogWorkData(ownerKey, 'main')[DK]?.fixedCount, 4)
    assert.equal(confirmSpy.mock.callCount(), 0)
  } finally {
    confirmSpy.mock.restore()
    await view.unmount()
  }
})
