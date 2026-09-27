// 로드맵 4-2 슬라이스 3 — 콜 상세 "산재보험료" 칸은 기사연동 계정 세션에서 숨긴다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeSettings } from '../../domain/practiceSettings.js'

/** DOM 노드가 없는지 boolean으로만 비교한다 — assert.equal(node, null)은 실패 시 노드 전체를 직렬화하려다 OOM이 난다. */
function assertMissing(/** @type {Element|null} */ el, /** @type {string} */ message) {
  assert.equal(!!el, false, message)
}

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CallDetailForm } = await import('./CallDetailForm.jsx')

const noop = () => {}
const PAYMENT_ON_SETTINGS = normalizeSettings({ paymentOn: true })

/** @param {Record<string, unknown>} props */
async function mount(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(CallDetailForm, {
      value: null, previousItem: null, dateKey: '2026-09-27', clients: [], settings: PAYMENT_ON_SETTINGS,
      onSave: noop, onClose: noop, ...props,
    }))
  })
  return { container, async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

test('결제 및 수금 입력이 켜져 있고 기사연동 계정이 아니면 산재보험료 칸이 보인다(기존 동작)', async () => {
  const view = await mount({ isEmployedDriver: false })
  try {
    assert.ok(view.container.querySelector('#callInsuranceFee'))
  } finally { await view.cleanup() }
})

test('기사연동 계정이면 결제 및 수금 입력이 켜져 있어도 산재보험료 칸이 안 보인다', async () => {
  const view = await mount({ isEmployedDriver: true })
  try {
    assertMissing(view.container.querySelector('#callInsuranceFee'), '산재보험료 칸이 없어야 한다')
    // 같은 영역의 다른 칸(계산서 종류·부가세 해제·입금 예정일)은 그대로 보여야 한다(범위 밖 — 안 건드림).
    assert.ok(view.container.querySelector('#callVatExempt'))
    assert.ok(view.container.querySelector('#callPaymentDueDate'))
  } finally { await view.cleanup() }
})

test('isEmployedDriver를 안 넘기면(기본값) 미연동과 같은 기존 동작 — 칸이 보인다', async () => {
  const view = await mount({})
  try {
    assert.ok(view.container.querySelector('#callInsuranceFee'))
  } finally { await view.cleanup() }
})

test('이미 산재보험료 값이 있는 콜 상세를 기사연동 계정이 열어도 칸만 숨고 값은 저장 시 그대로 남는다', async () => {
  let saved = /** @type {{ insuranceFee?: string }|null} */ (null)
  const view = await mount({
    value: { id: 'c1', loadLoc: '', unloadLoc: '', fare: '100,000', client: '', insuranceFee: '3,000' },
    isEmployedDriver: true,
    onSave: (/** @type {{ insuranceFee?: string }} */ draft) => { saved = draft },
  })
  try {
    assertMissing(view.container.querySelector('#callInsuranceFee'), '칸은 숨는다')
    const saveBtn = /** @type {HTMLButtonElement} */ (view.container.querySelector('.modal-btn.confirm'))
    assert.ok(saveBtn)
    await act(async () => { saveBtn.click() })
    assert.equal(saved?.insuranceFee, '3,000', '입력칸이 안 보여도 기존 값은 지워지지 않고 그대로 저장된다')
  } finally { await view.cleanup() }
})

test('결제 및 수금 입력이 꺼져 있으면 기사연동 여부와 무관하게 산재보험료 칸이 안 보인다(기존 동작 불변)', async () => {
  const paymentOffSettings = normalizeSettings({ paymentOn: false })
  const view = await mount({ settings: paymentOffSettings, isEmployedDriver: false })
  try {
    assertMissing(view.container.querySelector('#callInsuranceFee'), '결제 스위치가 꺼지면 칸이 없어야 한다')
  } finally { await view.cleanup() }
})
