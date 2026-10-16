// 로드맵 47-B — 하단 메뉴: 버튼은 글자 이름으로 읽고, 그림은 읽기에서 빼고, 지금 탭은 "현재 화면".
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: BottomNav } = await import('./BottomNav.jsx')

test('버튼 4개 이름·그림 숨김·지금 탭만 aria-current="page"', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(BottomNav, { active: 'revenue', onSelect: () => {} }))
  })
  try {
    const buttons = Array.from(container.querySelectorAll('button'))
    assert.deepEqual(buttons.map((btn) => btn.textContent), ['홈', '달력', '매출', '마이페이지'])
    buttons.forEach((btn) => assert.equal(btn.querySelector('svg')?.getAttribute('aria-hidden'), 'true'))
    assert.deepEqual(buttons.map((btn) => btn.getAttribute('aria-current')), [null, null, 'page', null])
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
