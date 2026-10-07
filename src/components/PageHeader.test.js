// 로드맵 14번 A: 하단 메뉴 첫 화면(매출·마이페이지)은 뒤로가기 없이 빈 자리, 나머지 화면은 그대로.
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
const { default: PageHeader } = await import('./PageHeader.jsx')
const { default: MyPage } = await import('./MyPage.jsx')
const { default: RevenuePage } = await import('./RevenuePage.jsx')

/** @param {import('react').ReactElement} element */
async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  const header = container.querySelector('.settings-header')
  return {
    header,
    back: [...container.querySelectorAll('button')].find((btn) => btn.title === '뒤로가기'),
    menu: [...container.querySelectorAll('button')].find((btn) => btn.title === '메뉴'),
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('onBack을 넘기면 뒤로가기 버튼이 있고 누르면 불린다', async () => {
  let calls = 0
  const view = await render(React.createElement(PageHeader, { title: '거래처', onBack: () => { calls += 1 }, onOpenMenu: () => {} }))
  try {
    assert.ok(view.back, '뒤로가기 버튼이 있어야 한다')
    await act(async () => { view.back?.click() })
    assert.equal(calls, 1)
  } finally {
    await view.cleanup()
  }
})

test('onBack이 없으면 뒤로가기 대신 빈 자리, 제목·메뉴는 그대로', async () => {
  const view = await render(React.createElement(PageHeader, { title: '매출', onOpenMenu: () => {} }))
  try {
    assert.equal(Boolean(view.back), false, '뒤로가기 버튼이 없어야 한다')
    assert.equal(view.header?.children.length, 3, '왼쪽 빈 자리 + 제목 + 메뉴 세 칸이어야 제목이 가운데에 남는다')
    assert.equal(view.header?.querySelector('.settings-title')?.textContent, '매출')
    assert.ok(view.menu, '메뉴 버튼은 그대로')
  } finally {
    await view.cleanup()
  }
})

test('하단 메뉴 첫 화면: 마이페이지·매출에는 뒤로가기가 없다', async () => {
  const my = await render(React.createElement(MyPage, { session: null, ownerKey: 'page-header-test', onOpen: () => {}, onOpenMenu: () => {} }))
  try {
    assert.equal(my.header?.querySelector('.settings-title')?.textContent, '마이페이지')
    assert.equal(Boolean(my.back), false, '마이페이지에 뒤로가기가 없어야 한다')
  } finally {
    await my.cleanup()
  }
  const revenue = await render(React.createElement(RevenuePage, { ownerKey: 'page-header-test', onOpenMenu: () => {} }))
  try {
    assert.equal(revenue.header?.querySelector('.settings-title')?.textContent, '매출')
    assert.equal(Boolean(revenue.back), false, '매출에 뒤로가기가 없어야 한다')
  } finally {
    await revenue.cleanup()
  }
})
