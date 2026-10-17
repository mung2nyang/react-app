// 이관 감사 5-5 검증 — 계산서 작성 모달에 이메일·업태·종목·사업장 주소 입력칸이 있고,
// 입력하면 그 필드만 바뀐 값으로 onChange가 호출되는지 확인.
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
const { default: TaxInvoiceDraftModal } = await import('./TaxInvoiceDraftModal.jsx')

const baseItem = {
  id: 'inv-1',
  clientName: '한빛물류',
  clientBizNumber: '123-45-67890',
  clientRepresentative: '김대표',
  clientEmail: 'tax@hanbit.kr',
  clientAddress: '서울시 강서구 1',
  clientBizType: '운수업',
  clientBizItem: '화물운송',
  itemName: '화물운송료',
  issueDate: '2026-09-24',
}

/** @param {(next: object) => void} onChange @param {object} [override] */
async function mount(onChange, override = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(TaxInvoiceDraftModal, {
      modalItem: { ...baseItem, ...override },
      flowMeta: { label: '매출 발행', partyHeading: '공급받는 자' },
      onChange,
      onCancel: () => {},
      onSave: () => {},
    }))
  })
  return { container, root }
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. */
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

const FIELDS = [
  ['#invEmail', 'clientEmail', 'new@hanbit.kr'],
  ['#invBizType', 'clientBizType', '서비스업'],
  ['#invBizItem', 'clientBizItem', '운송주선'],
  ['#invAddress', 'clientAddress', '부산시 해운대구 2'],
]

test('이메일·업태·종목·사업장 주소 입력칸이 기존 값으로 렌더된다', async () => {
  const { container, root } = await mount(() => {})
  try {
    for (const [selector, key] of FIELDS) {
      const input = container.querySelector(selector)
      assert.ok(input, `${selector} 입력칸이 없다`)
      assert.equal(input.value, baseItem[key])
    }
    assert.ok(container.querySelector('.personal-inline-fields #invRep'), '대표자가 인라인 그리드 안에 없다')
    assert.ok(container.querySelector('.personal-inline-fields #invEmail'), '이메일이 인라인 그리드 안에 없다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('입력하면 그 필드만 바뀐 값으로 onChange가 호출된다', async () => {
  for (const [selector, key, value] of FIELDS) {
    const calls = []
    const { container, root } = await mount((next) => calls.push(next))
    try {
      await act(async () => { typeInto(container.querySelector(selector), value) })
      assert.equal(calls.length, 1, `${selector} onChange 호출 횟수`)
      assert.deepEqual(calls[0], { ...baseItem, [key]: value })
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  }
})

test('사업자등록번호 칸: 숫자만 쳐도 000-00-00000 모양으로 - 자동 삽입, 10자리까지', async () => {
  const calls = []
  const { container, root } = await mount((next) => calls.push(next))
  try {
    const input = container.querySelector('#invBiz')
    assert.equal(input.value, '123-45-67890')
    await act(async () => { typeInto(input, '98765432109') })
    assert.equal(calls[0].clientBizNumber, '987-65-43210')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('사업자등록번호 검증번호가 틀리면 칸 아래 안내만 보인다', async () => {
  const { container, root } = await mount(() => {})
  try {
    assert.ok((container.textContent ?? '').includes('* 사업자등록번호를 다시 확인해 주세요'), '123-45-67890은 검증번호 불일치')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
  const ok = await mount(() => {}, { clientBizNumber: '123-45-67891' })
  try {
    assert.equal(ok.container.querySelector('.biz-number-hint'), null)
  } finally {
    await act(async () => { ok.root.unmount() })
    ok.container.remove()
  }
})

/** 저장 칸 검사용 — 입력이 상태에 반영되고 저장 횟수를 센다. @param {object} override */
async function mountStateful(override) {
  const saves = []
  function Harness() {
    const [item, setItem] = React.useState({ ...baseItem, ...override })
    return React.createElement(TaxInvoiceDraftModal, { modalItem: item, flowMeta: { label: '매출 발행', partyHeading: '공급받는 자' }, onChange: setItem, onCancel() {}, onSave: () => saves.push(item) })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  const saveButton = [...document.querySelectorAll('button')].find((button) => button.textContent === '저장')
  return {
    saves,
    async save() { await act(async () => { saveButton.click() }) },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('로드맵 82-C — 사업자등록번호 비우고 저장 → 그 칸 표시·문구·커서, 저장 안 함, 채우면 사라짐', async () => {
  const view = await mountStateful({ clientBizNumber: '' })
  try {
    await view.save()
    const input = document.querySelector('#invBiz')
    assert.equal(view.saves.length, 0)
    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.equal(document.querySelector('#invBiz-error')?.textContent, '사업자등록번호를 입력해 주세요.')
    assert.equal(document.activeElement, input)
    await act(async () => { typeInto(input, '1234567891') })
    assert.equal(input.getAttribute('aria-invalid'), null)
    await view.save()
    assert.equal(view.saves.length, 1)
  } finally {
    await view.cleanup()
  }
})

test('로드맵 82-C — 작성일자가 비면 날짜 단추에 표시·문구·커서, 저장 안 함', async () => {
  const view = await mountStateful({ issueDate: '' })
  try {
    await view.save()
    const trigger = document.querySelector('#invDate')?.closest('.app-temporal')?.querySelector('button')
    assert.equal(view.saves.length, 0)
    assert.equal(trigger?.getAttribute('aria-invalid'), 'true')
    assert.equal(document.querySelector('#invDate-error')?.textContent, '작성일자를 입력해 주세요.')
    assert.equal(document.activeElement, trigger)
  } finally {
    await view.cleanup()
  }
})
