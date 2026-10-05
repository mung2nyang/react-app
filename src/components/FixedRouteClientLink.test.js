// 앱 설정 고정 노선 "거래처 연결": 요약 줄 + 팝업(고르기·단가·파렛트·저장/연결 해제) → Store, 1곳 규칙, 스코프(서브차량·연동기사).
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
const { commitCars, commitClients, commitSettings } = await import('../store/commitHelpers.js')
const { getState } = await import('../store/app-store.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')
const { clientToDraft } = await import('../domain/clientDraft.js')

const BASE = { managerName: '김담당', phone: '010-1111-2222', bizNumber: '123-45-67891', paymentTerm: 'next_month_end', taxEmail: 'a@b.kr', isPinned: true }

/** @param {string} owner @param {Array<Record<string, unknown>>} clients @param {Record<string, unknown>} [settings] */
function seed(owner, clients, settings = { fixedOn: true, subFixedOn: true }) {
  commitSettings(owner, normalizeSettings(settings), { syncToCloud: false })
  commitClients(owner, clients, { syncToCloud: false })
}

/** @param {string} owner */
function clientsOf(owner) {
  return /** @type {Array<Record<string, unknown>>} */ (getState().clients[owner] || [])
}

/** @param {string} owner @param {string} path @param {Record<string, unknown>|null} [session] */
async function render(owner, path, session = null) {
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const page = React.createElement(AppSettingsPage, { ownerKey: owner, session, onBack: () => {}, showToast: (/** @type {string} */ m) => { toasts.push(m) } })
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/settings', element: page }),
        React.createElement(Route, { path: '/logs/:logId/settings', element: page }))))
  })
  // 팝업은 document.body에 그려진다(createPortal).
  const modal = () => document.querySelector('.fixed-route-client-modal')
  const openModal = async () => {
    const button = container.querySelector('.fixed-route-client-open')
    assert.ok(button instanceof window.HTMLButtonElement, '"+ 추가"/"수정" 버튼')
    await act(async () => { button.click() })
    assert.ok(modal(), '팝업 열림')
  }
  const options = async () => {
    if (!modal()) await openModal()
    const trigger = modal()?.querySelector('.app-dropdown-trigger')
    assert.ok(trigger instanceof window.HTMLButtonElement, '거래처 고르기 버튼')
    await act(async () => { trigger.click() })
    return [...(modal()?.querySelectorAll('[role="option"]') || [])].map((el) => el.textContent?.trim())
  }
  /** @param {string} label */
  const pick = async (label) => {
    if (!modal()?.querySelector('[role="option"]')) await options()
    const option = [...(modal()?.querySelectorAll('[role="option"]') || [])].find((el) => el.textContent?.trim() === label)
    assert.ok(option instanceof window.HTMLElement, `${label} 옵션`)
    await act(async () => { option.click() })
  }
  /** @param {string} selector @param {string} value */
  const type = async (selector, value) => {
    const input = document.querySelector(selector)
    assert.ok(input instanceof window.HTMLInputElement, selector)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
  }
  /** @param {string} value */
  const typePrice = (value) => type('#fixedRouteClientPrice', value)
  const save = async () => {
    const button = modal()?.querySelector('.modal-btn.confirm')
    assert.ok(button instanceof window.HTMLButtonElement, '저장 버튼')
    await act(async () => { button.click() })
  }
  return {
    container, toasts, modal, openModal, options, pick, type, typePrice, save,
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('수정 팝업에서 다른 거래처·단가 저장: 그 거래처만 연결, 이전 연결 해제, 다른 칸 보존, 팝업 닫힘', async () => {
  const owner = 'frl-link'
  seed(owner, [
    { id: 'c1', companyName: '한빛물류', fixedRouteLinked: true, fixedUnitPrice: '40,000' },
    { id: 'c2', companyName: '대한운송', ...BASE },
  ])
  const view = await render(owner, '/settings')
  try {
    assert.ok((view.container.textContent || '').includes('1회 40,000원'), '설정 화면엔 연결 요약')
    assert.equal(view.container.querySelector('.fixed-route-client-open')?.textContent, '수정')
    assert.deepEqual(await view.options(), ['한빛물류', '대한운송'])
    await view.pick('대한운송')
    await view.typePrice('55000')
    await view.save()
    const [c1, c2] = ['c1', 'c2'].map((id) => clientsOf(owner).find((c) => c.id === id))
    assert.equal(c2?.fixedRouteLinked, true)
    assert.equal(c2?.fixedUnitPrice, '55,000')
    assert.equal(c1?.fixedRouteLinked, false, '이전 연결 거래처는 1곳 규칙으로 해제')
    for (const [key, value] of Object.entries(BASE)) assert.equal(c2?.[key], value, `${key} 보존`)
    assert.ok(view.toasts.includes('거래처를 수정했습니다.'))
    assert.equal(view.modal(), null, '저장 성공 시 팝업 닫힘')
  } finally { await view.cleanup() }
})

test('수정 팝업의 "연결 해제" → 확인 → 연결 거래처 해제(단가 비움)', async () => {
  const owner = 'frl-unlink'
  seed(owner, [{ id: 'c1', companyName: '한빛물류', ...BASE, fixedRouteLinked: true, fixedUnitPrice: '40,000' }])
  const view = await render(owner, '/settings')
  try {
    await view.openModal()
    assert.equal(document.querySelector('#fixedRouteClientPrice')?.value, '40,000', '저장된 단가가 미리 채워짐')
    const unlink = view.modal()?.querySelector('.fixed-route-client-unlink')
    assert.ok(unlink instanceof window.HTMLButtonElement, '연결 해제 버튼')
    await act(async () => { unlink.click() })
    const confirms = document.querySelectorAll('.modal-btn.confirm')
    const confirm = confirms[confirms.length - 1]
    assert.ok(confirm instanceof window.HTMLButtonElement, '확인 창')
    await act(async () => { confirm.click() })
    const c1 = clientsOf(owner)[0]
    assert.equal(c1.fixedRouteLinked, false)
    assert.equal(c1.fixedUnitPrice, '')
    assert.equal(c1.companyName, '한빛물류')
    assert.equal(view.modal(), null)
  } finally { await view.cleanup() }
})

test('단가 빈칸 저장 → 기존 안내, 팝업 유지, Store 그대로', async () => {
  const owner = 'frl-empty'
  seed(owner, [{ id: 'c1', companyName: '한빛물류', ...BASE }])
  const view = await render(owner, '/settings')
  try {
    assert.equal(view.container.querySelector('.fixed-route-client-open')?.textContent, '+ 추가')
    await view.pick('한빛물류')
    await view.save()
    assert.ok(view.toasts.includes('고정노선 1회 단가를 입력해 주세요.'))
    assert.ok(view.modal(), '실패하면 팝업 유지')
    assert.equal(!!clientsOf(owner)[0].fixedRouteLinked, false)
  } finally { await view.cleanup() }
})

test('서브차량 운행일지 설정: 그 차량번호 거래처만, 연결 없으면 차주 메인 거래처 안내', async () => {
  const owner = 'frl-sub'
  seed(owner, [
    { id: 'm1', companyName: '차주메인', fixedRouteLinked: true, fixedUnitPrice: '30,000' },
    { id: 's1', companyName: '서브거래처', scopedToVehicleNumber: '11가1111' },
    { id: 'o1', companyName: '다른차거래처', scopedToVehicleNumber: '22나2222' },
  ])
  const view = await render(owner, '/logs/11%EA%B0%801111/settings')
  try {
    assert.ok((view.container.textContent || '').includes('차주 메인 연결 거래처(차주메인)를 씁니다'))
    await view.openModal()
    assert.equal(view.modal()?.querySelector('.app-dropdown-value')?.textContent, '선택', '연결 없으면 버튼에 "선택"')
    assert.deepEqual(await view.options(), ['서브거래처'], '그 차량 거래처만')
  } finally { await view.cleanup() }
})

test('연동기사 본인: 배정 차량 거래처만 나오고 저장됨', async () => {
  const owner = 'frl-driver'
  commitCars(owner, [{ id: 'car-1', type: 'main', number: '33다3333' }], { syncToCloud: false })
  seed(owner, [{ id: 'd1', companyName: '배정거래처', ...BASE, scopedToVehicleNumber: '33다3333' }])
  const view = await render(owner, '/settings', { userId: null, linkedOwnerId: 'owner-x', accountType: 'employed_driver' })
  try {
    assert.deepEqual(await view.options(), ['배정거래처'])
    await view.pick('배정거래처')
    await view.typePrice('20000')
    await view.save()
    const d1 = clientsOf(owner)[0]
    assert.equal(d1.fixedRouteLinked, true)
    assert.equal(d1.scopedToVehicleNumber, '33다3333', '스코프 보존')
  } finally { await view.cleanup() }
})

test('파렛트 단가: 켜고 단가 입력 → 함께 저장, 단가 비우면 안내', async () => {
  const owner = 'frl-pallet'
  seed(owner, [{ id: 'c1', companyName: '한빛물류', ...BASE }])
  const view = await render(owner, '/settings')
  try {
    await view.pick('한빛물류')
    await view.typePrice('50000')
    const toggle = document.querySelector('#fixedRoutePalletOn')
    assert.ok(toggle instanceof window.HTMLInputElement, '파렛트 스위치')
    await act(async () => { toggle.click() })
    await view.save()
    assert.ok(view.toasts.includes('파렛트 단가를 입력해 주세요.'))
    assert.equal(!!clientsOf(owner)[0].fixedRouteLinked, false, '안내만, 저장 안 됨')
    await view.type('#fixedRoutePalletPrice', '3000')
    await view.save()
    const c1 = clientsOf(owner)[0]
    assert.equal(c1.fixedRouteLinked, true)
    assert.equal(c1.palletOn, true)
    assert.equal(c1.palletPrice, '3,000')
    assert.ok((view.container.textContent || '').includes('1회 50,000원 · 파렛트 3,000원'), '요약에 파렛트 표시')
  } finally { await view.cleanup() }
})

test('clientToDraft: 저장된 거래처 전 필드를 그대로 옮긴다', () => {
  const draft = clientToDraft({
    id: 'x', companyName: '가', ...BASE, taxRepresentative: '대표', taxAddress: '주소', taxBizType: '운수', taxBizItem: '화물',
    paymentTermValue: '', commEnabled: true, commType: 'direct', commValue: 5000, fixedRouteLinked: true, fixedUnitPrice: '1,000',
    palletOn: true, palletPrice: 300, scopedToVehicleNumber: '11가1111',
  })
  assert.deepEqual(draft, {
    companyName: '가', managerName: '김담당', phone: '010-1111-2222', bizNumber: '123-45-67891', taxRepresentative: '대표',
    taxEmail: 'a@b.kr', taxAddress: '주소', taxBizType: '운수', taxBizItem: '화물', paymentTerm: 'next_month_end', paymentTermValue: '',
    isPinned: true, commEnabled: true, commType: 'direct', commValue: '5000', fixedRouteLinked: true, fixedUnitPrice: '1,000',
    palletOn: true, palletPrice: '300', scopedToVehicleNumber: '11가1111',
  })
})
