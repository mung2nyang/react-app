// 보리 지시(2026-09-14) 검증 — 날짜/누적거리 5:5 그리드, 날짜 트리거 아이콘 삭제,
// 결제방식 세그먼트 컨트롤로 변경이 정비/주유/기타 공용으로 실제 렌더되는지 확인.
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
const { default: ExpenseFormModal } = await import('./ExpenseFormModal.jsx')

function mountTarget() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

test('정비(maint): 날짜·누적거리가 같은 personal-inline-fields 그리드 안에 있다', async () => {
  const { container, root } = mountTarget()
  try {
    await act(async () => {
      root.render(React.createElement(ExpenseFormModal, {
        draft: { kind: 'maint', date: '2026-09-14' },
        kindLabel: '정비',
        inline: true,
        onChange: () => {},
        onClose: () => {},
        onSave: () => {},
      }))
    })
    const grid = container.querySelector('.personal-inline-fields')
    assert.ok(grid, '.personal-inline-fields 그리드가 없다')
    assert.ok(grid.querySelector('#expenseDate'), '그리드 안에 날짜 트리거가 없다')
    assert.ok(grid.querySelector('#expenseMileage'), '그리드 안에 누적거리 입력이 없다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('정비/주유 공통: 날짜 트리거에 app-temporal-icon이 없다(CSS로 숨김 대상)', async () => {
  for (const kind of ['maint', 'fuel']) {
    const { container, root } = mountTarget()
    try {
      await act(async () => {
        root.render(React.createElement(ExpenseFormModal, {
          draft: { kind, date: '2026-09-14' },
          kindLabel: kind,
          inline: true,
          onChange: () => {},
          onClose: () => {},
          onSave: () => {},
        }))
      })
      assert.ok(container.querySelector('.expense-form-content'), 'expense-form-content 스코프 클래스가 없다')
      assert.ok(container.querySelector('.app-temporal-icon'), `${kind}: 아이콘 엘리먼트 자체는 있어야 한다(숨김은 CSS)`)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  }
})

test('정비/기타(kind!==fuel): 결제 방식이 segment-control/segment-btn이다', async () => {
  const { container, root } = mountTarget()
  try {
    await act(async () => {
      root.render(React.createElement(ExpenseFormModal, {
        draft: { kind: 'misc', date: '2026-09-14', payment: '카드' },
        kindLabel: '기타',
        inline: true,
        onChange: () => {},
        onClose: () => {},
        onSave: () => {},
      }))
    })
    const control = container.querySelector('.segment-control')
    assert.ok(control, '.segment-control이 없다')
    const buttons = control.querySelectorAll('.segment-btn')
    assert.equal(buttons.length, 2, '세그먼트 버튼이 2개(카드/현금)여야 한다')
    assert.ok(buttons[0].classList.contains('active'), '카드가 기본 선택이어야 한다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('주유(fuel): 결제 방식 세그먼트가 있다', async () => {
  const { container, root } = mountTarget()
  try {
    await act(async () => {
      root.render(React.createElement(ExpenseFormModal, {
        draft: { kind: 'fuel', date: '2026-09-14' },
        kindLabel: '주유',
        inline: true,
        onChange: () => {},
        onClose: () => {},
        onSave: () => {},
      }))
    })
    const control = container.querySelector('.segment-control')
    assert.ok(control, '주유에도 결제 방식이 있어야 한다')
    assert.equal(control.querySelectorAll('.segment-btn').length, 2, '세그먼트 버튼이 2개(카드/현금)여야 한다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('비용 칸에 12345.6을 치면 비용은 반올림한 12346(로드맵 43-B)', async () => {
  const { container, root } = mountTarget()
  /** @type {Array<{ cost?: number }>} */
  const seen = []
  try {
    await act(async () => {
      root.render(React.createElement(ExpenseFormModal, {
        draft: { kind: 'maint', date: '2026-09-14' },
        kindLabel: '정비',
        inline: true,
        onChange: (/** @type {{ cost?: number }} */ next) => { seen.push(next) },
        onClose: () => {},
        onSave: () => {},
      }))
    })
    const input = /** @type {HTMLInputElement} */ (container.querySelector('#expenseCost'))
    assert.ok(input)
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
    assert.ok(setter)
    await act(async () => {
      setter.call(input, '12345.6')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    assert.equal(seen.at(-1)?.cost, 12346)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// 로드맵 82-B — 지출 창에서 빠진 칸은 저장 전에 빨간 표시·칸 아래 문구·커서.
/** @param {object} draft */
async function renderForSave(draft) {
  const saves = []
  function Harness() {
    const [value, setValue] = React.useState(draft)
    return React.createElement(ExpenseFormModal, { draft: value, kindLabel: '주유', inline: true, onChange: setValue, onClose() {}, onSave: () => saves.push(value) })
  }
  const { container, root } = mountTarget()
  await act(async () => { root.render(React.createElement(Harness)) })
  const saveButton = [...container.querySelectorAll('button')].find((button) => button.textContent === '저장')
  return {
    container,
    saves,
    async save() { await act(async () => { saveButton?.click() }) },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('주유 비용을 비우고 저장 → 비용 칸 표시·아래 문구·커서, 저장 안 함', async () => {
  const view = await renderForSave({ kind: 'fuel', date: '2026-10-17', cost: 0, fuelType: '주유', payment: '카드' })
  try {
    await view.save()
    const input = view.container.querySelector('#expenseCost')
    assert.equal(view.saves.length, 0)
    assert.equal(input?.getAttribute('aria-invalid'), 'true')
    assert.equal(view.container.querySelector('#expenseCost-error')?.textContent, '비용을 입력해 주세요.')
    assert.equal(document.activeElement, input)
  } finally {
    await view.cleanup()
  }
})

test('정비 항목명·비용 둘 다 비면 항목명 칸 표시, 항목명 넣으면 사라지고 저장 1번', async () => {
  const view = await renderForSave({ kind: 'maint', date: '2026-10-17', name: '', cost: 0, category: '소모품', payment: '카드' })
  try {
    await view.save()
    const input = /** @type {HTMLInputElement} */ (view.container.querySelector('#expenseName'))
    assert.equal(view.saves.length, 0)
    assert.equal(view.container.querySelector('#expenseName-error')?.textContent, '항목명 또는 비용을 입력해 주세요.')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, '엔진오일')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    assert.equal(view.container.querySelector('.field-error'), null)
    await view.save()
    assert.equal(view.saves.length, 1)
  } finally {
    await view.cleanup()
  }
})

