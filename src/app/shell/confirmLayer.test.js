// 앱 공용 확인 창은 화면 안의 창(점검표 창 등)보다 위에 그려져야 한다 — 같은 층(z-index)이면 문서 순서가 뒤인 쪽이 위.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter, Route, Routes } = await import('react-router-dom')
const { withSession } = await import('../../testSupport/withSession.js')
const { withToast } = await import('../../testSupport/withToast.js')
const { normalizeSettings } = await import('../../domain/practiceSettings.ts')
const { commitSettings, commitWorkData } = await import('../../data/store/commitHelpers.ts')
const { confirmDialog } = await import('../../shared/ui/confirmDialog.jsx')
const { default: AppShell } = await import('./AppShell.jsx')

test('확인 창은 화면 내용(점검표 창이 그려지는 곳)보다 문서 순서상 뒤에 그려진다', async () => {
  const ownerKey = 'confirm-layer-owner'
  commitSettings(ownerKey, normalizeSettings({ callDetail: true }))
  commitWorkData(ownerKey, {})
  window.history.replaceState(null, '', '/app/calendar')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/*', element: React.createElement(AppShell) }))
  await act(async () => {
    root.render(withToast(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey, session: { userId: ownerKey, name: '보리', accountType: 'owner' } })), () => {}))
  })

  /** @type {Promise<boolean>} */
  let answer = Promise.resolve(false)
  await act(async () => { answer = confirmDialog({ title: '점검표를 지울까요?', confirmLabel: '지우기', danger: true }) })
  const dialog = container.querySelector('[role="alertdialog"]')
  const page = container.querySelector('.page-transition')
  assert.ok(dialog, '확인 창이 그려짐')
  assert.ok(page, '화면 내용 자리가 있음')
  assert.ok(page.compareDocumentPosition(dialog) & window.Node.DOCUMENT_POSITION_FOLLOWING, '확인 창이 화면 내용 뒤')

  const cancel = [...dialog.querySelectorAll('button')].find((el) => el.textContent?.trim() === '취소')
  assert.ok(cancel)
  await act(async () => { cancel.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  assert.equal(await answer, false)
  await act(async () => { root.unmount() })
  container.remove()
})
