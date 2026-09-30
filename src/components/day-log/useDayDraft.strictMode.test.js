// 로드맵 0-3-B — 개발 모드 StrictMode(켜기→끄기→다시 켜기)에서도 열기만 하면 저장이 안 돌고, 저장 후 상태가 "저장됨"이 되는지.
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { useDayDraft } = await import('./useDayDraft.js')
const { commitWorkData } = await import('../../store/commitHelpers.js')
const { readOwnerLogWorkData } = await import('../../store/ownerDataHooks.js')

const DK = '2026-10-20'

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @param {string} ownerKey */
async function mountStrict(ownerKey) {
  /** @type {{ current: ReturnType<typeof useDayDraft>|null }} */
  const latest = { current: null }
  function Harness() {
    latest.current = useDayDraft(ownerKey, DK)
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(React.StrictMode, null, React.createElement(Harness)))
  })
  return {
    latest,
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

test('StrictMode에서 일지를 열기만 하면 저장이 돌지 않는다(운행 없는 빈 기록이 지워지지 않음)', async () => {
  const ownerKey = 'guest-0-3-b-open'
  commitWorkData(ownerKey, { [DK]: { isOff: false, fixedCount: 0, callDetails: [] } }, { syncToCloud: false })
  const view = await mountStrict(ownerKey)
  try {
    await act(async () => { await wait(750) })
    assert.ok(readOwnerLogWorkData(ownerKey, 'main')[DK], '열기만 했는데 빈 날로 저장돼 그날 기록이 지워지면 안 된다')
    assert.equal(view.latest.current?.autoSaveStatus, 'idle')
  } finally {
    await view.unmount()
  }
})

test('StrictMode에서 편집하면 저장되고 상태가 "저장됨"이 된다', async () => {
  const ownerKey = 'guest-0-3-b-edit'
  commitWorkData(ownerKey, {}, { syncToCloud: false })
  const view = await mountStrict(ownerKey)
  try {
    await act(async () => { view.latest.current?.dispatch({ type: 'patchDraft', patch: { fixedCount: 2 } }) })
    await act(async () => { await wait(750) })
    assert.equal(readOwnerLogWorkData(ownerKey, 'main')[DK]?.fixedCount, 2)
    assert.equal(view.latest.current?.autoSaveStatus, 'saved', '다시 켜진 뒤 "화면 닫힘"으로 남으면 저장 중…에 멈춘다')
  } finally {
    await view.unmount()
  }
})
