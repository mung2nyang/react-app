// 세금계산서 정리 ②: 세금계산서는 서류 발급 첫 탭으로 옮겨 사이드메뉴·마이페이지 따로 된 메뉴가 없다.
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
const { act } = React
const { default: MyPage } = await import('./MyPage.jsx')
const { default: SideMenu } = await import('./SideMenu.jsx')

/** @param {import('react').ReactElement} element */
async function renderText(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  const text = container.textContent || ''
  await act(async () => { root.unmount() })
  container.remove()
  return text
}

test('사이드메뉴·마이페이지에 "세금계산서" 메뉴 없음(서류 발급으로 들어감)', async () => {
  const side = await renderText(React.createElement(SideMenu, { open: true, onClose: () => {}, onSelect: () => {} }))
  assert.ok(side.includes('서류 발급'))
  assert.equal(side.includes('세금계산서'), false)

  const my = await renderText(React.createElement(MyPage, {
    session: { userId: 'u-1', name: '차주', phone: '010-0000-0000', accountType: 'owner' },
    ownerKey: 'tax-menu-moved',
    onOpen: () => {},
    onBack: () => {},
  }))
  assert.ok(my.includes('서류 발급'))
  assert.equal(my.includes('세금계산서'), false)
})
