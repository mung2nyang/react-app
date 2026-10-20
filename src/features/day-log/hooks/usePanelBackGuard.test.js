// 로드맵 63-B: 일지 입력 칸이 열린 동안 휴대폰 뒤로가기도 ← 처럼 먼저 묻는다(실제 window.history로).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act, useState } = React
const { BrowserRouter, useNavigate } = await import('react-router-dom')
const { default: usePanelBackGuard } = await import('./usePanelBackGuard.js')
const { panelGuardOnTop, popPanelGuardThen } = await import('../../../app/historyMoves.js')
const { ConfirmDialogHost, confirmDialog } = await import('../../../shared/ui/confirmDialog.jsx')

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// 정해진 시간 대신 실제로 그 일이 일어날 때까지 기다림(jsdom 뒤로가기는 늦게 끝남).
/** @param {() => boolean} ok @param {number} [limitMs] */
async function waitUntil(ok, limitMs = 2000) {
  const end = Date.now() + limitMs
  while (!ok() && Date.now() < end) await wait(5)
}

/** @param {Array<boolean>|'dialog'} answers 확인 창 답(차례대로), 'dialog'면 앱 확인 창을 실제로 띄움 */
async function mount(answers) {
  window.history.replaceState(null, '', '/app/calendar')
  const calls = { confirm: 0, leave: 0 }
  /** @type {{ setOpen: (open: boolean) => void, go: ReturnType<typeof useNavigate> | null }} */
  const ctl = { setOpen: () => {}, go: null }
  function Probe() {
    const [open, setOpen] = useState(false)
    ctl.setOpen = setOpen
    ctl.go = useNavigate()
    const ask = async () => {
      calls.confirm += 1
      if (answers === 'dialog') return confirmDialog({ title: '저장하지 않은 입력이 있습니다', confirmLabel: '나가기', cancelLabel: '계속 입력' })
      return answers.shift() ?? true
    }
    usePanelBackGuard(open, ask, () => { calls.leave += 1; setOpen(false) })
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(Probe), React.createElement(ConfirmDialogHost))) })
  await act(async () => { ctl.go?.('/app/day/2026-10-15', { state: { from: 'calendar' } }) })
  const idx = () => Reflect.get(window.history.state || {}, 'idx')
  const usr = () => Reflect.get(window.history.state || {}, 'usr')
  const back = async () => {
    await act(async () => {
      const popped = new Promise((resolve) => { window.addEventListener('popstate', () => resolve(undefined), { once: true }) })
      window.history.back()
      await popped
      await wait(20)
    })
  }
  const setOpen = async (/** @type {boolean} */ open) => { await act(async () => { ctl.setOpen(open); await wait(20) }) }
  const dialog = () => container.querySelector('[role="alertdialog"]')
  return { calls, idx, usr, back, setOpen, dialog, container, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('열리면 붙잡기 기록 1장(달력에서 온 표시 유지), 저장·취소로 닫으면 조용히 빠짐', async () => {
  const view = await mount([])
  try {
    const start = view.idx()
    await view.setOpen(true)
    assert.equal(view.idx(), start + 1)
    assert.equal(panelGuardOnTop(), true)
    assert.equal(Reflect.get(view.usr(), 'from'), 'calendar')
    await view.setOpen(false)
    await act(async () => { await waitUntil(() => view.idx() === start) })
    assert.equal(view.idx(), start, '닫으면 붙잡기 기록이 빠짐')
    assert.equal(window.location.pathname, '/app/day/2026-10-15')
    assert.equal(view.calls.confirm, 0, '확인 창 없음')
  } finally {
    await view.cleanup()
  }
})

test('열린 채 뒤로 → 확인 창, [계속 입력]이면 다시 붙잡고, [나가기]면 닫고 나감', async () => {
  const view = await mount([false, true])
  try {
    const start = view.idx()
    await view.setOpen(true)
    await view.back()
    assert.equal(view.calls.confirm, 1)
    assert.equal(window.location.pathname, '/app/day/2026-10-15', '일지 그대로')
    assert.equal(view.idx(), start + 1, '계속 입력 → 다시 붙잡기')
    assert.equal(view.calls.leave, 0)
    await view.back()
    assert.equal(view.calls.confirm, 2)
    await act(async () => { await waitUntil(() => view.calls.leave === 1 && view.idx() === start) })
    assert.equal(view.calls.leave, 1, '나가기')
    assert.equal(view.idx(), start, '붙잡기 기록이 다시 쌓이지 않음')
  } finally {
    await view.cleanup()
  }
})

test('붙잡기 기록이 위에 있을 때 이동하면 먼저 빼고 이어서(확인 창 없음)', async () => {
  const view = await mount([])
  try {
    const start = view.idx()
    await view.setOpen(true)
    let moved = false
    await act(async () => {
      popPanelGuardThen(() => { moved = true })
      await waitUntil(() => moved)
    })
    assert.equal(moved, true)
    assert.equal(view.idx(), start)
    assert.equal(view.calls.confirm, 0)
  } finally {
    await view.cleanup()
  }
})

test('확인 창이 뜬 채 뒤로 → 창만 닫히고 일지·붙잡기 그대로, [나가기]면 붙잡기 빼고 나감 (로드맵 63-C)', async () => {
  const view = await mount('dialog')
  try {
    const start = view.idx()
    await view.setOpen(true)
    await view.back()
    assert.ok(view.dialog(), '확인 창')
    assert.equal(view.idx(), start + 1, '묻는 동안에도 붙잡기 기록이 다시 있음')
    assert.equal(panelGuardOnTop(), true)
    await view.back()
    await act(async () => { await waitUntil(() => view.dialog() === null && view.idx() === start + 1) })
    assert.equal(view.dialog(), null, '창만 닫힘')
    assert.equal(window.location.pathname, '/app/day/2026-10-15', '일지 그대로')
    assert.equal(view.idx(), start + 1)
    assert.equal(view.calls.leave, 0)
    await view.back()
    assert.ok(view.dialog(), '다시 뒤로 → 확인 창')
    const leaveBtn = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === '나가기')
    await act(async () => { leaveBtn?.click() })
    await act(async () => { await waitUntil(() => view.calls.leave === 1 && view.idx() === start) })
    assert.equal(view.calls.leave, 1)
    assert.equal(view.idx(), start, '붙잡기 기록을 빼고 나감')
  } finally {
    await view.cleanup()
  }
})
