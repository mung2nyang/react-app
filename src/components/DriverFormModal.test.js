// 로드맵 82-B — 기사 초대 창에서 빠지거나 틀린 칸은 저장 전에 빨간 표시·칸 아래 문구·커서(날짜 칸은 단추).
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
const { default: DriverFormModal } = await import('./DriverFormModal.jsx')

const FILLED = { name: '김기사', phone: '010-1234-5678', inviteCode: 'ABCDE23456', vehicleNumber: '', startDate: '', endDate: '' }

/** @param {object} initial @param {boolean} [required] @param {Array<object>} [cars] */
async function render(initial, required = false, cars = []) {
  const saves = []
  function Harness() {
    const [draft, setDraft] = React.useState(initial)
    return React.createElement(DriverFormModal, {
      draft, setDraft, editingId: null, drivers: [], assignableCars: [], cars, required, onCancel() {}, onSave: () => saves.push(draft),
    })
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

test('전화번호만 비면 전화번호 칸 표시·커서, 저장 안 함', async () => {
  const view = await render({ ...FILLED, phone: '' })
  try {
    await view.save()
    const input = view.container.querySelector('#drvPhone')
    assert.equal(view.saves.length, 0)
    assert.equal(input?.getAttribute('aria-invalid'), 'true')
    assert.equal(view.container.querySelector('#drvPhone-error')?.textContent, '전화번호를 입력해 주세요.')
    assert.equal(document.activeElement, input)
  } finally {
    await view.cleanup()
  }
})

test('로그인인데 배정 차량이 비면 차량 칸에 "배정 차량을 입력해 주세요."', async () => {
  const view = await render(FILLED, true)
  try {
    await view.save()
    assert.equal(view.saves.length, 0)
    assert.equal(view.container.querySelector('#drvCar')?.getAttribute('aria-invalid'), 'true')
    assert.equal(view.container.querySelector('#drvCar-error')?.textContent, '배정 차량을 입력해 주세요.')
  } finally {
    await view.cleanup()
  }
})

test('메인 차량을 배정하면 차량 칸에 표시(창이 전체 차량을 받아서)', async () => {
  const view = await render({ ...FILLED, vehicleNumber: '11가1111', startDate: '2026-10-17' }, true, [{ id: 'm', number: '11가1111', type: 'main' }])
  try {
    await view.save()
    assert.equal(view.saves.length, 0)
    assert.equal(view.container.querySelector('#drvCar')?.getAttribute('aria-invalid'), 'true')
    assert.equal(view.container.querySelector('#drvCar-error')?.textContent, '메인 차량은 기사에게 배정할 수 없습니다. 기사 차량 번호를 입력해 주세요.')
  } finally {
    await view.cleanup()
  }
})

test('시작일이 비면 날짜 단추에 표시·커서(달력은 안 열림)', async () => {
  const view = await render({ ...FILLED, vehicleNumber: '77가7777' }, true)
  try {
    await view.save()
    const trigger = view.container.querySelector('#drvStart')?.closest('.app-temporal')?.querySelector('button')
    assert.equal(view.saves.length, 0)
    assert.equal(trigger?.getAttribute('aria-invalid'), 'true')
    assert.equal(trigger?.getAttribute('aria-describedby'), 'drvStart-error')
    assert.equal(view.container.querySelector('#drvStart-error')?.textContent, '계약 시작일을 선택해 주세요.')
    assert.equal(document.activeElement, trigger)
    assert.equal(trigger?.getAttribute('aria-expanded'), 'false')
  } finally {
    await view.cleanup()
  }
})

test('다 채우면 저장 1번, 표시 없음', async () => {
  const view = await render({ ...FILLED, vehicleNumber: '77가7777', startDate: '2026-10-17' }, true)
  try {
    await view.save()
    assert.equal(view.saves.length, 1)
    assert.equal(view.container.querySelector('.field-error'), null)
  } finally {
    await view.cleanup()
  }
})
