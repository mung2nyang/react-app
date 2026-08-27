// Step 5(달력 홈 재작성) 재감사 5번 — hasUnpaid를 단위 테스트(dayHasUnpaid)로만 확인하고
// "UI로 직접 안 만들어봤다"는 알려진 한계로 남겼던 부분을 닫는다: CalendarCell을 실제로
// jsdom에 렌더링해서 hasUnpaid=true일 때 .unpaid-dot이 DOM에 실제로 존재하는지 확인한다
// (App.test.js가 도입한 jsxLoaderHook.mjs 인프라를 재사용 — 전체 App 부트 없이 이 컴포넌트
// 하나만 가볍게 렌더한다).
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
const { default: CalendarCell } = await import('./CalendarCell.jsx')

const CELL = { key: '2026-08-06', day: 6, empty: false, sunday: false, saturday: false, today: false }

function mountTarget() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

test('재감사 5번 — hasUnpaid=true면 .unpaid-dot이 실제로 렌더된다', async () => {
  const { container, root } = mountTarget()
  try {
    await act(async () => {
      root.render(React.createElement(CalendarCell, {
        cell: CELL,
        badgeLabel: null,
        isOff: false,
        hasUnpaid: true,
        onSelect: () => {},
      }))
    })
    assert.ok(container.querySelector('.unpaid-dot'), 'hasUnpaid=true인데 .unpaid-dot이 DOM에 없다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('재감사 5번 — hasUnpaid=false면 .unpaid-dot이 렌더되지 않는다', async () => {
  const { container, root } = mountTarget()
  try {
    await act(async () => {
      root.render(React.createElement(CalendarCell, {
        cell: CELL,
        badgeLabel: null,
        isOff: false,
        hasUnpaid: false,
        onSelect: () => {},
      }))
    })
    assert.equal(container.querySelector('.unpaid-dot'), null, 'hasUnpaid=false인데 .unpaid-dot이 렌더됐다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
