import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: OwnerRevenueView } = await import('./OwnerRevenueView.jsx')
const { commitExpenses } = await import('../../store/commitHelpers.js')

test('일지에서 비용을 커밋하면 매출 화면이 리마운트 없이 지출 합계를 갱신한다', async () => {
  const ownerKey = 'sot-expenses-revenue'
  const now = new Date()
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`
  commitExpenses(ownerKey, [], { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(OwnerRevenueView, { ownerKey }))
    })
    assert.ok(container.textContent.includes('운행 지출'), '손익 지출 카드가 보여야 한다')

    await act(async () => {
      commitExpenses(ownerKey, [{
        id: 'fuel-sot-1',
        kind: 'fuel',
        date: dateKey,
        name: '주유',
        cost: 12345,
        subsidy: 0,
      }], { syncToCloud: false })
    })
    assert.ok(
      container.textContent.includes('12,345'),
      'loadExpenses 스냅샷이면 리마운트 없이 주유 금액이 안 바뀐다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
