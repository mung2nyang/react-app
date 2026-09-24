// 이관 감사 11-5·11-6 — 기사 관리 화면 하단 "사업자·정산 계좌 정보" 카드: 입력 → 저장 → 다시 열면 유지.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CarBusinessInfoSection } = await import('./CarBusinessInfoSection.jsx')
const { commitCars } = await import('../../store/commitHelpers.js')
const { getState } = await import('../../store/app-store.js')

const OWNER_PROFILE = { bizName: '차주상사', bizNumber: '111-22-33333', bankName: '차주은행', accountNumber: '000-111', accountHolder: '차주명의' }

/** @param {HTMLElement} container @param {string} selector */
function input(container, selector) {
  const el = container.querySelector(selector)
  assert.ok(el, selector)
  return /** @type {HTMLInputElement} */ (el)
}

/** @param {HTMLElement} container */
function saveButton(container) {
  const el = container.querySelector('.car-biz-save')
  assert.ok(el)
  return /** @type {HTMLButtonElement} */ (el)
}

/** @param {string} owner */
function subCar(owner) {
  const car = getState().cars[owner].find((item) => item.id === 'sub-1')
  assert.ok(car)
  return car
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLInputElement} el @param {string} value */
function typeInto(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  assert.ok(setter)
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

/** @param {string} ownerKey @param {{ bizName?: string, bizNumber?: string }} profile @param {Array<string>} toasts */
async function mount(ownerKey, profile, toasts) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const car = subCar(ownerKey)
  await act(async () => {
    root.render(React.createElement(CarBusinessInfoSection, {
      ownerKey, car, cars: getState().cars[ownerKey], profile, showToast: (message) => toasts.push(message),
    }))
  })
  return {
    container,
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

test('기본은 "내 사업자 정보와 동일"(차주 사업자·계좌 두 줄 표시, 입력칸 없음), 끄면 입력칸 7개+계좌 3개', async () => {
  const owner = 'biz-section-default'
  commitCars(owner, [{ id: 'sub-1', type: 'sub', number: '11가1111' }], { syncToCloud: false })
  const { container, cleanup } = await mount(owner, OWNER_PROFILE, [])
  try {
    assert.equal(input(container, '#carBizSameAsOwner').checked, true)
    assert.ok((container.textContent ?? '').includes('차주상사 · 111-22-33333'))
    assert.ok((container.textContent ?? '').includes('차주은행 · 000-111 · 차주명의'))
    for (const id of ['#carBizName', '#carBankName', '#carAccountHolder', '#carAccountNumber']) assert.equal(container.querySelector(id), null, id)
    await act(async () => { input(container, '#carBizSameAsOwner').click() })
    for (const id of ['#carBankName', '#carAccountHolder', '#carAccountNumber']) assert.ok(container.querySelector(id), id)
    for (const id of ['Name', 'Number', 'Representative', 'Address', 'Type', 'Item', 'Email']) {
      assert.ok(container.querySelector(`#carBiz${id}`), `#carBiz${id}`)
    }
  } finally { await cleanup() }
})

test('차주 사업자·계좌 정보가 비어 있으면 안내 문구', async () => {
  const owner = 'biz-section-empty'
  commitCars(owner, [{ id: 'sub-1', type: 'sub', number: '11가1111' }], { syncToCloud: false })
  const { container, cleanup } = await mount(owner, {}, [])
  try {
    assert.ok((container.textContent ?? '').includes('마이페이지 개인정보에 사업자정보를 먼저 입력해 주세요.'))
    assert.ok((container.textContent ?? '').includes('마이페이지 개인정보에 정산 계좌를 먼저 입력해 주세요.'))
  } finally { await cleanup() }
})

test('끄고 입력 후 저장하면 Store에 반영·"저장했습니다." 토스트, 다시 열면 값이 채워진다', async () => {
  const owner = 'biz-section-save'
  commitCars(owner, [{ id: 'sub-1', type: 'sub', number: '11가1111', personalInfo: { driverName: '김기사' } }], { syncToCloud: false })
  /** @type {Array<string>} */
  const toasts = []
  const first = await mount(owner, OWNER_PROFILE, toasts)
  try {
    await act(async () => { input(first.container, '#carBizSameAsOwner').click() })
    await act(async () => {
      typeInto(input(first.container, '#carBizName'), '한빛운수')
      typeInto(input(first.container, '#carBizNumber'), '123-45-67890')
      typeInto(input(first.container, '#carBizRepresentative'), '김대표')
      typeInto(input(first.container, '#carBankName'), '국민은행')
      typeInto(input(first.container, '#carAccountNumber'), '111-222-333')
      typeInto(input(first.container, '#carAccountHolder'), '김기사')
    })
    await act(async () => { saveButton(first.container).click() })
    assert.deepEqual(toasts, ['저장했습니다.'])
    const saved = subCar(owner)
    assert.equal(saved.businessInfo?.sameAsOwner, false)
    assert.equal(saved.businessInfo?.name, '한빛운수')
    assert.equal(saved.personalInfo?.name, '김대표')
    assert.equal(saved.personalInfo?.bizNumber, '123-45-67890')
    assert.equal(saved.personalInfo?.bank, '국민은행')
    assert.equal(saved.personalInfo?.driverName, '김기사')
  } finally { await first.cleanup() }

  const second = await mount(owner, OWNER_PROFILE, toasts)
  try {
    assert.equal(input(second.container, '#carBizSameAsOwner').checked, false)
    assert.equal(input(second.container, '#carBizName').value, '한빛운수')
    assert.equal(input(second.container, '#carBizRepresentative').value, '김대표')
    assert.equal(input(second.container, '#carBankName').value, '국민은행')
    assert.equal(input(second.container, '#carAccountNumber').value, '111-222-333')
    await act(async () => { input(second.container, '#carBizSameAsOwner').click() })
    await act(async () => { saveButton(second.container).click() })
    const back = subCar(owner)
    assert.equal(back.businessInfo?.sameAsOwner, true)
    assert.equal(back.businessInfo?.name, '')
    assert.equal(back.personalInfo?.name, '')
    assert.equal(back.personalInfo?.bank, '')
    assert.equal(back.personalInfo?.account, '')
    assert.equal(back.personalInfo?.driverName, '김기사')
  } finally { await second.cleanup() }
})
