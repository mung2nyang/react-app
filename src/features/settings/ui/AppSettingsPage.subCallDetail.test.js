// 기사 차량 앱 설정: 차량 설정을 저장한 적 없어도 고정 노선이 꺼져 있으면 세부 입력이 켜짐(잠김)으로 보인다.
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
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')

/** @param {string} ownerKey @param {boolean} subFixedOn */
async function renderSubSettings(ownerKey, subFixedOn) {
  commitSettings(ownerKey, normalizeSettings({ subFixedOn }))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const page = withSession(React.createElement(AppSettingsPage, { onBack: () => {} }), { ownerKey })
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/logs/11%EA%B0%801111/settings'] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/logs/:logId/settings', element: page }))))
  })
  const toggle = container.querySelector('#callDetailToggle')
  assert.ok(toggle instanceof window.HTMLInputElement, '세부 입력 스위치')
  const result = { checked: toggle.checked, disabled: toggle.disabled, chips: !!container.querySelector('.settings-chip-group') }
  await act(async () => { root.unmount() })
  container.remove()
  return result
}

test('고정 노선 꺼짐·차량 설정 없음 → 세부 입력 켜짐·잠김, 항목 칩 보임', async () => {
  assert.deepEqual(await renderSubSettings('sub-calldetail-off', false), { checked: true, disabled: true, chips: true })
})

test('고정 노선 켜짐·차량 설정 없음 → 세부 입력 꺼짐(지금과 같음)', async () => {
  assert.deepEqual(await renderSubSettings('sub-calldetail-on', true), { checked: false, disabled: false, chips: false })
})
