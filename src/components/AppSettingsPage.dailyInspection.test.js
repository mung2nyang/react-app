// 로드맵 9-B-1 — 앱 설정의 "일상점검표 사용" 스위치: 메인 = 계정 설정, 기사차량 운행일지 설정 = 그 차량 설정, 비회원은 숨김.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Route, Routes } = await import('react-router-dom')
const { act } = React
const { default: AppSettingsPage } = await import('./AppSettingsPage.jsx')
const { commitSettings } = await import('../store/commitHelpers.js')
const { readOwnerSettings } = await import('../store/ownerDataHooks.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

/** @param {string} ownerKey @param {string} path */
async function render(ownerKey, path) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const page = React.createElement(AppSettingsPage, { ownerKey, onBack: () => {} })
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/settings', element: page }),
        React.createElement(Route, { path: '/logs/:logId/settings', element: page }))))
  })
  return { container, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

/** @param {HTMLElement} container */
async function toggle(container) {
  const input = container.querySelector('#dailyInspectionToggle')
  assert.ok(input instanceof window.HTMLInputElement, '일상점검표 사용 스위치가 있어야 한다')
  assert.equal(input.checked, false, '처음 값은 꺼짐')
  await act(async () => { input.click() })
}

test('메인 앱 설정: 스위치를 켜면 계정 설정 dailyInspectionOn=true, 기사차량 설정은 그대로', async () => {
  commitSettings('di-page-1', normalizeSettings({}), { syncToCloud: false })
  const view = await render('di-page-1', '/settings')
  try {
    await toggle(view.container)
    assert.equal(readOwnerSettings('di-page-1').dailyInspectionOn, true)
  } finally {
    await view.cleanup()
  }
})

test('기사차량 운행일지 설정: 그 차량 설정만 켜지고 메인은 꺼진 그대로', async () => {
  commitSettings('di-page-2', normalizeSettings({}), { syncToCloud: false })
  const view = await render('di-page-2', '/logs/11%EA%B0%801111/settings')
  try {
    await toggle(view.container)
    const s = readOwnerSettings('di-page-2')
    assert.equal(s.subCarSettings?.['11가1111']?.dailyInspectionOn, true)
    assert.equal(s.dailyInspectionOn, false)
  } finally {
    await view.cleanup()
  }
})

test('비회원: 스위치 없음', async () => {
  const view = await render('guest', '/settings')
  try {
    assert.equal(view.container.querySelector('#dailyInspectionToggle'), null)
  } finally {
    await view.cleanup()
  }
})
