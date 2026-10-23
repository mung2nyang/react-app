// 로드맵 24-G-2 — 운비서 [등록하기]로 거래처 화면에 오면 새 등록 창이 들은 값으로 채워진 채 열린다(저장은 사람이).
// 주소 상태는 읽은 뒤 지워 다시 그려도 열리지 않는다. 연동 기사 화면(한 차량 거래처)도 같다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter, Route, Routes } = await import('react-router-dom')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { commitClients } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerClients } = await import('../../../data/store/ownerDataHooks.ts')
const { default: ClientListPage } = await import('./ClientListPage.jsx')
const { default: ScopedClientsList } = await import('./ScopedClientsList.jsx')

const HEARD = { name: '한진', manager: '김철수', phone: '01012345678', paymentTerm: 'after_days', paymentTermValue: 30, commType: 'percent', commValue: 5 }

/** @param {string} ownerKey @param {import('react').ReactElement} page @param {object|null} usr */
async function render(ownerKey, page, usr) {
  window.history.replaceState(usr ? { usr, key: 'k1', idx: 0 } : null, '', '/app/clients')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/clients', element: page }))
  await act(async () => { root.render(withToast(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey })), () => {})) })
  /** @param {string} id */
  const value = (id) => /** @type {HTMLInputElement|null} */ (container.querySelector(`#${id}`))?.value
  /** @param {string} text */
  const button = (text) => [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  return {
    container, value, button,
    async click(/** @type {Element|undefined} */ el) {
      assert.ok(el)
      await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('차주 거래처 화면: 들은 값으로 새 등록 창이 열리고, 주소 상태에서는 지워진다(from은 남김)', async () => {
  commitClients('assist-client-owner', [])
  const view = await render('assist-client-owner', React.createElement(ClientListPage, {}), { from: 'home', assistantClient: HEARD })
  try {
    assert.equal(view.container.querySelector('.modal-title')?.textContent?.includes('수정'), false, '새 등록')
    assert.equal(view.value('clientCompanyName'), '한진')
    assert.equal(view.value('clientManagerName'), '김철수')
    assert.equal(view.value('clientPhone'), '010-1234-5678')
    assert.equal(view.value('clientPaymentTermValue'), '30')
    assert.equal(view.value('clientCommValue'), '5')
    assert.equal(window.history.state?.usr?.assistantClient, undefined)
    assert.equal(window.history.state?.usr?.from, 'home')
    await view.click(view.button('취소'))
    assert.equal(view.value('clientCompanyName'), undefined, '닫힘')
    assert.deepEqual(readOwnerClients('assist-client-owner'), [], '[취소]면 저장 안 함')
  } finally { await view.cleanup() }
})

test('[저장]하면 지금 등록 창 저장 그대로 한 곳이 생긴다', async () => {
  commitClients('assist-client-save', [])
  const view = await render('assist-client-save', React.createElement(ClientListPage, {}), { from: 'home', assistantClient: HEARD })
  try {
    await view.click(view.button('저장'))
    const saved = readOwnerClients('assist-client-save')
    assert.equal(saved.length, 1)
    assert.equal(saved[0].companyName, '한진')
    assert.equal(saved[0].managerName, '김철수')
    assert.equal(saved[0].phone, '010-1234-5678')
    assert.equal(saved[0].paymentTerm, 'after_days')
  } finally { await view.cleanup() }
})

test('주소 상태가 지워진 뒤 다시 그리면 등록 창이 열리지 않는다, 이상한 값이면 열지 않는다', async () => {
  commitClients('assist-client-again', [])
  const first = await render('assist-client-again', React.createElement(ClientListPage, {}), { from: 'home', assistantClient: HEARD })
  const cleared = window.history.state?.usr
  await first.cleanup()
  const again = await render('assist-client-again', React.createElement(ClientListPage, {}), cleared)
  try {
    assert.equal(again.value('clientCompanyName'), undefined)
  } finally { await again.cleanup() }
  const odd = await render('assist-client-again', React.createElement(ClientListPage, {}), { from: 'home', assistantClient: { ...HEARD, name: '' } })
  try {
    assert.equal(odd.value('clientCompanyName'), undefined)
  } finally { await odd.cleanup() }
})

test('한 차량 거래처 화면(연동 기사): 들은 값으로 새 등록 창, 저장하면 그 차량 거래처', async () => {
  commitClients('assist-client-driver', [])
  const page = React.createElement(ScopedClientsList, { scopeKey: '12가3456', listId: 'scopedClientList' })
  const view = await render('assist-client-driver', page, { from: 'home', assistantClient: HEARD })
  try {
    assert.equal(view.value('clientCompanyName'), '한진')
    assert.equal(view.value('clientPhone'), '010-1234-5678')
    await view.click(view.button('저장'))
    const saved = readOwnerClients('assist-client-driver')
    assert.equal(saved.length, 1)
    assert.equal(saved[0].scopedToVehicleNumber, '12가3456')
  } finally { await view.cleanup() }
})
