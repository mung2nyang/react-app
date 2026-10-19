// 로드맵 58-A — 한 차량 거래처 화면 두 벌(연동 기사 앱 거래처, 차주의 기사 거래처): 목록·추가·수정·삭제·제목·찾을 수 없음.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const { act } = React
const { default: OwnerScopedClientsView } = await import('./OwnerScopedClientsView.jsx')
const { default: LinkedDriverClientsPage } = await import('../drivers/LinkedDriverClientsPage.jsx')
const { replaceOwnerState } = await import('../../store/owner-state.js')
const { getState } = await import('../../store/app-store.js')

const OWNER = 'guest'
const MINE = { id: 'c-1', companyName: '한빛물류', managerName: '김담당', phone: '010-1111-2222', bizNumber: '123-45-67890', scopedToVehicleNumber: '12가3456' }
const OTHER = { id: 'c-2', companyName: '다른거래처', scopedToVehicleNumber: '99하9999' }
const MAIN_ONLY = { id: 'c-3', companyName: '차주거래처' }

/** @param {object} state */
function seed(state) {
  localStorage.clear()
  replaceOwnerState(OWNER, /** @type {import('../../store/owner-state.js').OwnerSnapshot} */ (state))
}

/** @param {import('react').ReactElement} element @param {string} path @param {string} pattern */
async function mount(element, path = '/', pattern = '/') {
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const page = React.cloneElement(element, { showToast: (/** @type {string} */ message) => { toasts.push(message) } })
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, { path: pattern, element: page }))))
  })
  return {
    container,
    toasts,
    names: () => [...container.querySelectorAll('.client-card-title strong')].map((el) => el.textContent),
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** @param {string} label @param {ParentNode} [scope] */
async function click(label, scope = document) {
  const el = [...scope.querySelectorAll('button')].find((item) => item.textContent?.trim() === label || item.title === label)
  assert.ok(el, `${label} 버튼`)
  await act(async () => { el.click() })
}

/** @param {string} selector @param {string} value */
async function typeInto(selector, value) {
  const input = /** @type {HTMLInputElement} */ (document.querySelector(selector))
  assert.ok(input, selector)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

/** 추가 → 수정 창 값 → 삭제를 차례로 확인. @param {Awaited<ReturnType<typeof mount>>} view @param {string} plate */
async function addEditDelete(view, plate) {
  await click('+ 추가')
  await typeInto('#clientCompanyName', '새거래처')
  await click('저장')
  const added = (getState().clients[OWNER] || []).find((client) => client.companyName === '새거래처')
  assert.equal(added?.scopedToVehicleNumber, plate)
  assert.ok(view.names().includes('새거래처'))
  assert.ok(view.toasts.includes('거래처를 등록했습니다.'))

  const card = [...view.container.querySelectorAll('.client-list-card')].find((el) => el.textContent?.includes('한빛물류'))
  assert.ok(card)
  await click('수정', card)
  assert.equal(/** @type {HTMLInputElement} */ (document.querySelector('#clientCompanyName')).value, '한빛물류')
  await click('취소')

  await click('삭제', card)
  await click('삭제', /** @type {ParentNode} */ (document.querySelector('[role="alertdialog"]')))
  assert.equal((getState().clients[OWNER] || []).some((client) => client.id === 'c-1'), false)
  assert.equal(view.names().includes('한빛물류'), false)
}

beforeEach(() => { document.body.innerHTML = '' })

test('연동 기사 앱 거래처: 안내 문구, 내 차량 거래처만, 추가는 내 차량으로, 수정 값 채움, 삭제', async () => {
  seed({ cars: [{ id: 'car-1', number: '12가3456', type: 'main' }], clients: [MINE, OTHER, MAIN_ONLY], workLogs: { main: {} } })
  const view = await mount(React.createElement(OwnerScopedClientsView, { ownerKey: OWNER }))
  try {
    assert.ok(view.container.textContent?.includes('차주와 공유하는 거래처 목록입니다.'))
    assert.deepEqual(view.names(), ['한빛물류'])
    assert.ok(view.container.textContent?.includes('결제주기'), '공용 거래처 카드(결제주기 줄)')
    await addEditDelete(view, '12가3456')
  } finally { await view.cleanup() }
})

test('차주의 미연동 기사 거래처: 제목, 그 차량 거래처만, 추가는 그 차량으로, 수정 값 채움, 삭제', async () => {
  seed({ cars: [{ id: 'car-1', number: '11가1111', type: 'main' }, { id: 'car-2', number: '12가3456', type: 'sub', driverName: '박기사' }], clients: [MINE, OTHER, MAIN_ONLY], drivers: [], workLogs: { main: {} } })
  const view = await mount(React.createElement(LinkedDriverClientsPage, { ownerKey: OWNER }), '/logs/12가3456/clients', '/logs/:logId/clients')
  try {
    assert.ok(view.container.textContent?.includes('박기사 거래처'))
    assert.equal(view.container.textContent?.includes('차주와 공유하는'), false)
    assert.deepEqual(view.names(), ['한빛물류'])
    await addEditDelete(view, '12가3456')
  } finally { await view.cleanup() }
})

test('차주의 연동 기사 거래처: "○○ 기사 거래처" 제목, 그 기사 차량 거래처만', async () => {
  seed({
    cars: [{ id: 'car-1', number: '11가1111', type: 'main' }, { id: 'car-2', number: '12가3456', type: 'sub' }],
    clients: [MINE, OTHER],
    drivers: [{ id: 'd-1', name: '최연동', phone: '010-3333-4444', inviteCode: '111111', status: 'linked', vehicleNumber: '12가3456' }],
    workLogs: { main: {} },
  })
  const view = await mount(React.createElement(LinkedDriverClientsPage, { ownerKey: OWNER }), '/drivers/d-1/clients', '/drivers/:linkId/clients')
  try {
    assert.ok(view.container.textContent?.includes('최연동 기사 거래처'))
    assert.deepEqual(view.names(), ['한빛물류'])
  } finally { await view.cleanup() }
})

test('차주의 기사 거래처: 차량·기사를 못 찾으면 안내', async () => {
  seed({ cars: [{ id: 'car-1', number: '11가1111', type: 'main' }], clients: [MINE], drivers: [], workLogs: { main: {} } })
  const plate = await mount(React.createElement(LinkedDriverClientsPage, { ownerKey: OWNER }), '/logs/00가0000/clients', '/logs/:logId/clients')
  try {
    assert.ok(plate.container.textContent?.includes('차량 정보를 찾을 수 없습니다.'))
  } finally { await plate.cleanup() }
  const link = await mount(React.createElement(LinkedDriverClientsPage, { ownerKey: OWNER }), '/drivers/none/clients', '/drivers/:linkId/clients')
  try {
    assert.ok(link.container.textContent?.includes('연동된 기사 정보를 찾을 수 없습니다.'))
    assert.ok(link.container.textContent?.includes('기사 거래처'))
  } finally { await link.cleanup() }
})
