// 하루 화면 주유 카드의 유가보조금 표시(로드맵 46-A) — 표시만, 합계는 그대로.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: ExpenseGroups } = await import('./ExpenseGroups.jsx')

const noop = () => {}

async function render(dayExpenses) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(ExpenseGroups, { dayExpenses, onEdit: noop, onDelete: noop }))
  })
  const text = container.textContent
  const badges = [...container.querySelectorAll('.maint-payment-badge')].map((el) => el.textContent)
  await act(async () => { root.unmount() })
  container.remove()
  return { text, badges }
}

describe('ExpenseGroups — 유가보조금 표시', () => {
  test('보조금이 있으면 주유 카드에 "유가보조금 N원"이 보이고 합계는 주유비 그대로', async () => {
    const { text, badges } = await render([
      { id: 'f1', kind: 'fuel', date: '2026-10-14', fuelType: '경유', cost: 80000, subsidy: 12000, liters: 50 },
    ])
    assert.ok(badges.includes('유가보조금 12,000원'))
    assert.ok(text.includes('주유 지출 합계80,000원'))
    assert.ok(text.includes('지출 합계80,000원'))
  })

  test('보조금이 0원이면 상자가 없다', async () => {
    const { badges } = await render([
      { id: 'f2', kind: 'fuel', date: '2026-10-14', fuelType: '경유', cost: 80000, subsidy: 0, liters: 50 },
    ])
    assert.equal(badges.some((b) => b.startsWith('유가보조금')), false)
  })

  test('정비 카드는 결제 상자만 그대로', async () => {
    const { badges } = await render([
      { id: 'm1', kind: 'maint', date: '2026-10-14', name: '오일', cost: 50000, subsidy: 9000, payment: '현금' },
    ])
    assert.deepEqual(badges, ['현금'])
  })
})
