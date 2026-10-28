// 로드맵 82-A — 거래처 창에서 빠지거나 틀린 칸은 저장 전에 빨간 표시·칸 아래 문구·커서, 고치면 표시가 사라진다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: ClientFormModal } = await import('./ClientFormModal.jsx')

const EMPTY = { companyName: '', managerName: '', phone: '', bizNumber: '', paymentTerm: 'next_month_end', paymentTermValue: '', commEnabled: false, commType: 'percent', commValue: '' }

/** @param {object} initial */
async function render(initial) {
  const saves = []
  function Harness() {
    const [draft, setDraft] = React.useState(initial)
    return React.createElement(ClientFormModal, { draft, setDraft, editingId: null, onCancel() {}, onSave: () => saves.push(draft) })
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

test('거래처명을 비우고 저장 → 저장 안 함, 칸 빨간 표시·아래 문구·커서', async () => {
  const view = await render(EMPTY)
  try {
    await view.save()
    const input = /** @type {HTMLInputElement} */ (view.container.querySelector('#clientCompanyName'))
    assert.equal(view.saves.length, 0)
    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.equal(input.getAttribute('aria-describedby'), 'clientCompanyName-error')
    assert.equal(view.container.querySelector('#clientCompanyName-error')?.textContent, '거래처명을 입력해 주세요.')
    assert.equal(document.activeElement, input)
  } finally {
    await view.cleanup()
  }
})

test('문제 칸을 고치기 시작하면 빨간 표시가 사라진다', async () => {
  const view = await render(EMPTY)
  try {
    await view.save()
    const input = /** @type {HTMLInputElement} */ (view.container.querySelector('#clientCompanyName'))
    await typeInto(input, '한')
    assert.equal(input.hasAttribute('aria-invalid'), false)
    assert.equal(view.container.querySelector('.field-error'), null)
  } finally {
    await view.cleanup()
  }
})

test('수수료를 켜고 값을 비우면 수수료 칸 표시, 다 채우면 저장 1번', async () => {
  const view = await render({ ...EMPTY, companyName: '한진', commEnabled: true })
  try {
    await view.save()
    const comm = /** @type {HTMLInputElement} */ (view.container.querySelector('#clientCommValue'))
    assert.equal(view.saves.length, 0)
    assert.equal(comm.getAttribute('aria-invalid'), 'true')
    assert.equal(view.container.querySelector('#clientCommValue-error')?.textContent, '수수료 값을 입력해 주세요.')
    await typeInto(comm, '5')
    await view.save()
    assert.equal(view.saves.length, 1)
    assert.equal(view.container.querySelector('.field-error'), null)
  } finally {
    await view.cleanup()
  }
})

/** 풀어 주기 전까지 끝나지 않는 저장으로 창을 그린다. @param {object} initial */
async function renderHeld(initial) {
  /** @type {Array<() => void>} */
  const releases = []
  let calls = 0
  function Harness() {
    const [draft, setDraft] = React.useState(initial)
    return React.createElement(ClientFormModal, {
      draft, setDraft, editingId: null, onCancel() {},
      onSave: () => { calls += 1; return new Promise((resolve) => { releases.push(() => resolve(undefined)) }) },
    })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  const saveButton = /** @type {HTMLButtonElement} */ (container.querySelector('.modal-btn.confirm'))
  return {
    saveButton,
    calls: () => calls,
    async click() { await act(async () => { saveButton.click() }) },
    async release() { await act(async () => { releases.splice(0).forEach((done) => done()) }) },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('저장 중에 [저장]을 또 눌러도 저장은 1번, 버튼은 "저장 중…"으로 잠김', async () => {
  const view = await renderHeld({ ...EMPTY, companyName: '한진' })
  try {
    await view.click()
    await view.click()
    assert.equal(view.calls(), 1)
    assert.equal(view.saveButton.textContent, '저장 중…')
    assert.equal(view.saveButton.disabled, true)
  } finally {
    await view.cleanup()
  }
})

test('저장이 끝나고 창이 남으면 잠금이 풀려 다시 누르면 1번 더', async () => {
  const view = await renderHeld({ ...EMPTY, companyName: '한진' })
  try {
    await view.click()
    await view.release()
    assert.equal(view.saveButton.textContent, '저장')
    assert.equal(view.saveButton.disabled, false)
    await view.click()
    assert.equal(view.calls(), 2)
  } finally {
    await view.cleanup()
  }
})
