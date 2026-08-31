import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: AppSettingsPage } = await import('./AppSettingsPage.jsx')
const { commitSettings } = await import('../store/commitHelpers.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

test('설정을 커밋하면 앱 설정 화면이 리마운트 없이 표시 방식을 갱신한다', async () => {
  const ownerKey = 'sot-settings-page'
  commitSettings(ownerKey, normalizeSettings({ inputMode: 'count' }), { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(AppSettingsPage, { ownerKey, onBack: () => {} }))
    })
    const fareBtn = [...container.querySelectorAll('button')].find((el) => el.textContent === '금액')
    assert.ok(fareBtn, '금액 버튼이 있어야 한다')
    assert.equal(fareBtn.classList.contains('active-work'), false)

    await act(async () => {
      commitSettings(ownerKey, normalizeSettings({ inputMode: 'fare' }), { syncToCloud: false })
    })
    assert.ok(
      fareBtn.classList.contains('active-work'),
      'loadPracticeSettings 스냅샷이면 리마운트 없이 금액 모드가 안 바뀐다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
