import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CarDriverConnectPanel } = await import('./CarDriverConnectPanel.jsx')

test('운행 일지 탭은 안내 문구만 렌더한다', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(CarDriverConnectPanel, {
        tab: 'log',
        onTab: () => {},
        inviteCode: '',
        onInviteCode: () => {},
        drivers: [],
      }))
    })
    const body = container.querySelector('.car-driver-connect-body')
    assert.ok(body)
    assert.equal(
      body?.textContent?.trim(),
      '기사 연동 없이, 차주가 운행 일지를 직접 작성합니다.',
    )
    assert.equal(container.querySelectorAll('.car-daylog-preview').length, 0)
    assert.equal(container.querySelectorAll('.car-open-vehicle-log').length, 0)
  } finally {
    root.unmount()
    container.remove()
  }
})

test('신규 등록(logEnabled 없던 시절의 disabled 게이트 삭제됨) — 운행 일지 탭은 항상 클릭 가능', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let currentTab = 'link'
  try {
    await act(async () => {
      root.render(React.createElement(CarDriverConnectPanel, {
        tab: currentTab,
        onTab: (next) => { currentTab = next },
        inviteCode: '',
        onInviteCode: () => {},
        drivers: [],
      }))
    })
    const tabs = [...container.querySelectorAll('.car-driver-connect-tabs button')]
    const logTab = tabs.find((b) => b.textContent === '운행 일지')
    assert.ok(logTab)
    assert.equal(logTab.disabled, false)
    await act(async () => { logTab.click() })
    assert.equal(currentTab, 'log')
  } finally {
    root.unmount()
    container.remove()
  }
})
