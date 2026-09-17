// @ts-check
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: AppSettingsPage } = await import('./AppSettingsPage.jsx')

test('AppSettingsPage 백업 섹션: 게스트 세션에서만 노출되고 비게스트 세션에서는 숨겨진다', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    // 1. 게스트 세션 (ownerKey === 'guest')
    await act(async () => {
      root.render(React.createElement(AppSettingsPage, { ownerKey: 'guest', onBack: () => {}, showToast: () => {} }))
    })

    const buttonsGuest = [...container.querySelectorAll('button')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim())
    assert.ok(buttonsGuest.some((t) => t?.includes('백업 저장하기')), '게스트 화면에는 백업 저장 버튼이 있어야 한다')
    assert.ok(buttonsGuest.some((t) => t?.includes('백업 불러오기')), '게스트 화면에는 백업 불러오기 버튼이 있어야 한다')
    assert.ok(container.textContent?.includes('데이터 관리 (백업 / 복구)'))
    assert.ok(container.textContent?.includes('아직 백업한 적 없음') || container.textContent?.includes('마지막 백업:'))

    // 2. 비게스트(로그인/소속기사/차주) 세션 (ownerKey !== 'guest')
    await act(async () => {
      root.render(React.createElement(AppSettingsPage, { ownerKey: 'owner-user-99', onBack: () => {}, showToast: () => {} }))
    })

    const buttonsOwner = [...container.querySelectorAll('button')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim())
    assert.equal(buttonsOwner.some((t) => t?.includes('백업 저장하기')), false, '로그인 화면에는 백업 저장 버튼이 없어야 한다')
    assert.equal(buttonsOwner.some((t) => t?.includes('백업 불러오기')), false, '로그인 화면에는 백업 불러오기 버튼이 없어야 한다')
    assert.equal(container.textContent?.includes('데이터 관리 (백업 / 복구)'), false)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
