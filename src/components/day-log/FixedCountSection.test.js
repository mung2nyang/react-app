// 하루 화면 고정 노선·파렛트 금액 줄(로드맵 46-B) — 표시만, 횟수 × 거래처 단가.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: FixedCountSection } = await import('./FixedCountSection.jsx')
const { default: PalletSection } = await import('./PalletSection.jsx')

const noop = () => {}
const client = { companyName: '고정거래처', fixedRouteLinked: true, fixedUnitPrice: '50,000', palletOn: true, palletPrice: 5000 }

async function amountText(Component, props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Component, { onChange: noop, ...props })) })
  const text = container.querySelector('.fixed-route-amount')?.textContent ?? null
  await act(async () => { root.unmount() })
  container.remove()
  return text
}

describe('FixedCountSection — 고정 노선 금액 줄', () => {
  const base = { isOff: false, quickCounts: [], fixedRouteClient: client }

  test('횟수 × 1회 단가를 보여 준다', async () => {
    assert.equal(await amountText(FixedCountSection, { ...base, count: 3 }), '고정 노선 금액150,000원(3회 × 50,000원)')
  })

  test('0회·휴무·단가 없음이면 줄이 없다', async () => {
    assert.equal(await amountText(FixedCountSection, { ...base, count: 0 }), null)
    assert.equal(await amountText(FixedCountSection, { ...base, count: 3, isOff: true }), null)
    assert.equal(await amountText(FixedCountSection, { ...base, count: 3, fixedRouteClient: null }), null)
    assert.equal(await amountText(FixedCountSection, { ...base, count: 3, fixedRouteClient: { ...client, fixedUnitPrice: '' } }), null)
  })
})

describe('PalletSection — 파렛트 금액 줄', () => {
  const base = { visible: true, isOff: false, fixedRouteClient: client }

  test('장 수 × 파렛트 단가를 보여 준다', async () => {
    assert.equal(await amountText(PalletSection, { ...base, palletCount: 2 }), '파렛트 금액10,000원(2장 × 5,000원)')
  })

  test('0장·단가 없음·칸 숨김이면 줄이 없다', async () => {
    assert.equal(await amountText(PalletSection, { ...base, palletCount: 0 }), null)
    assert.equal(await amountText(PalletSection, { ...base, palletCount: 2, fixedRouteClient: { ...client, palletPrice: 0 } }), null)
    assert.equal(await amountText(PalletSection, { ...base, palletCount: 2, visible: false }), null)
  })
})
