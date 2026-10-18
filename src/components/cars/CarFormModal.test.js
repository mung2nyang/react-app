// 로드맵 82-B — 차량 창에서 빠지거나 틀린 칸은 저장 전에 빨간 표시·칸 아래 문구·커서, 고치면 표시가 사라진다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CarFormModal } = await import('./CarFormModal.jsx')

const EMPTY = {
  number: '', tonnage: '', type: 'main', driverName: '', driverPhone: '', driverPayMode: 'revenue', driverSalaryAmount: '',
  commEnabled: true, commType: 'percent', commission: '', inviteCode: '', inviteStartDate: '', inviteDriverId: null, connectMode: 'log',
}

/** @param {object} initial @param {boolean} [cloud] */
async function render(initial, cloud = false) {
  const saves = []
  function Harness() {
    const [draft, setDraft] = React.useState(initial)
    return React.createElement(CarFormModal, { draft, setDraft, editingId: null, cloud, drivers: [], onCancel() {}, onSave: () => saves.push(draft) })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  const saveButton = [...container.querySelectorAll('button')].find((button) => button.textContent === '저장')
  return {
    container,
    saves,
    async save() { await act(async () => { saveButton?.click() }) },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** @param {HTMLInputElement} input @param {string} value */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

test('차량번호를 비우고 저장 → 저장 안 함, 칸 빨간 표시·아래 문구·커서, 고치면 사라짐', async () => {
  const view = await render(EMPTY)
  try {
    await view.save()
    const input = /** @type {HTMLInputElement} */ (view.container.querySelector('#newCarNumber'))
    assert.equal(view.saves.length, 0)
    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.equal(input.getAttribute('aria-describedby'), 'newCarNumber-error')
    assert.equal(view.container.querySelector('#newCarNumber-error')?.textContent, '차량번호를 입력해 주세요.')
    assert.equal(document.activeElement, input)
    await typeInto(input, '1')
    assert.equal(input.hasAttribute('aria-invalid'), false)
    assert.equal(view.container.querySelector('.field-error'), null)
  } finally {
    await view.cleanup()
  }
})

test('월급제 금액을 비우면 금액 칸 표시, 채우면 저장 1번', async () => {
  const view = await render({ ...EMPTY, number: '12가3456', type: 'sub', driverPayMode: 'salary', commEnabled: false })
  try {
    await view.save()
    const input = /** @type {HTMLInputElement} */ (view.container.querySelector('#newCarSettlementValue'))
    assert.equal(view.saves.length, 0)
    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.equal(view.container.querySelector('#newCarSettlementValue-error')?.textContent, '월급제는 급여 금액을 입력해 주세요.')
    await typeInto(input, '3000000')
    await view.save()
    assert.equal(view.saves.length, 1)
  } finally {
    await view.cleanup()
  }
})

test('로그인·기사 연동 탭이면 기사명 칸을 먼저, 칸에 맞는 문구로', async () => {
  const view = await render({ ...EMPTY, type: 'sub', connectMode: 'link' }, true)
  try {
    await view.save()
    assert.equal(view.saves.length, 0)
    assert.equal(view.container.querySelector('#newDriverName')?.getAttribute('aria-invalid'), 'true')
    assert.equal(view.container.querySelector('#newDriverName-error')?.textContent, '기사명을 입력해 주세요.')
  } finally {
    await view.cleanup()
  }
})

/** @param {Element} container @param {string} label */
async function pickOption(container, label) {
  const trigger = /** @type {HTMLButtonElement} */ (container.querySelector('#newCarShareBase'))
  await act(async () => { trigger.click() })
  const option = [...container.querySelectorAll('[role="option"]')].find((item) => item.textContent === label)
  assert.ok(option instanceof window.HTMLElement, label)
  await act(async () => { option.click() })
}

const SUB = { ...EMPTY, type: 'sub', number: '22나2222', driverName: '박기사', driverPhone: '010-1111-2222', commission: '30' }

test('로드맵 61 — 매출제 %면 "기사 몫 기준" 보임(기본 운송료 전체), 고르고 저장하면 그 값', async () => {
  const view = await render(SUB)
  try {
    const trigger = view.container.querySelector('#newCarShareBase')
    assert.ok(trigger, '드롭다운')
    assert.equal(trigger?.textContent?.includes('운송료 전체'), true)
    await pickOption(view.container, '거래처 수수료 뗀 뒤')
    await view.save()
    assert.equal(view.saves.length, 1)
    assert.equal(/** @type {{ driverShareBase?: string }} */ (view.saves[0]).driverShareBase, 'afterClientCommission')
  } finally { await view.cleanup() }
})

test('로드맵 61 — 저장된 기준으로 열면 그 값, 월급제·건당·메인 차량이면 드롭다운 숨김(값은 그대로)', async () => {
  const opened = await render({ ...SUB, driverShareBase: 'afterClientCommission' })
  try {
    assert.equal(opened.container.querySelector('#newCarShareBase')?.textContent?.includes('거래처 수수료 뗀 뒤'), true)
    const salary = [...opened.container.querySelectorAll('button')].find((button) => button.textContent === '월급제')
    await act(async () => { salary?.click() })
    assert.equal(opened.container.querySelector('#newCarShareBase'), null)
    const revenue = [...opened.container.querySelectorAll('button')].find((button) => button.textContent === '매출제')
    await act(async () => { revenue?.click() })
    assert.equal(opened.container.querySelector('#newCarShareBase')?.textContent?.includes('거래처 수수료 뗀 뒤'), true, '다시 매출제면 그 값 그대로')
  } finally { await opened.cleanup() }
  for (const draft of [{ ...SUB, commType: 'direct' }, { ...SUB, driverPayMode: 'salary' }, { ...EMPTY }]) {
    const view = await render(draft)
    try { assert.equal(view.container.querySelector('#newCarShareBase'), null, JSON.stringify([draft.type, draft.commType, draft.driverPayMode])) } finally { await view.cleanup() }
  }
})
