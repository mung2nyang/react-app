// 앱 설정의 "운비서 버튼" 스위치: 로그인 계정 메인 설정에만, 처음 켜짐, 끄면 계정 설정 unbiseoDockOn=false.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Route, Routes } = await import('react-router-dom')
const { act } = React
const { default: AppSettingsPage } = await import('./AppSettingsPage.jsx')
const { commitSettings } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerSettings } = await import('../../../data/store/ownerDataHooks.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')

/** @param {string} ownerKey @param {string} path */
async function render(ownerKey, path) {
  commitSettings(ownerKey, normalizeSettings({}))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const page = withSession(React.createElement(AppSettingsPage, { onBack: () => {} }), { ownerKey })
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/settings', element: page }),
        React.createElement(Route, { path: '/logs/:logId/settings', element: page }))))
  })
  return { container, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('메인 앱 설정: 처음 켜짐, 끄면 계정 설정 unbiseoDockOn=false', async () => {
  const view = await render('dock-setting-1', '/settings')
  try {
    const input = view.container.querySelector('#unbiseoDockToggle')
    assert.ok(input instanceof window.HTMLInputElement, '운비서 버튼 스위치가 있어야 한다')
    assert.equal(input.checked, true, '처음 값은 켜짐')
    await act(async () => { input.click() })
    assert.equal(readOwnerSettings('dock-setting-1').unbiseoDockOn, false)
    assert.equal(input.checked, false)
  } finally {
    await view.cleanup()
  }
})

test('비회원과 기사차량 운행일지 설정에는 스위치가 없다', async () => {
  for (const [ownerKey, path] of [['guest', '/settings'], ['dock-setting-2', '/logs/11%EA%B0%801111/settings']]) {
    const view = await render(ownerKey, path)
    try {
      assert.equal(view.container.querySelector('#unbiseoDockToggle'), null, `${ownerKey} ${path}`)
    } finally {
      await view.cleanup()
    }
  }
})
