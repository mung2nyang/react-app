// 로드맵 109-B — 일지 제목 아래 하루 운송료 합계(고정 노선 + 파렛트 + 세부 운송료), 0원·휴무면 글 없이 자리만.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: DayFareTotal } = await import('./DayFareTotal.jsx')

const CLIENT = { id: 'cl', companyName: '고정거래처', fixedRouteLinked: true, fixedUnitPrice: 50000, palletOn: true, palletPrice: 5000 }
const DAY = { isOff: false, fixedCount: 5, palletCount: 5, callDetails: [{ id: 'c1', fare: '120,000' }, { id: 'c2', fare: 80000 }] }

/** @param {object} props */
async function renderLine(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { root.render(React.createElement(DayFareTotal, props)) })
    const line = container.querySelector('.day-fare-total')
    return { found: !!line, text: line?.textContent || '' }
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
}

test('고정 5회 × 50,000 + 파렛트 5장 × 5,000 + 세부 200,000 = 475,000원', async () => {
  const line = await renderLine({ draft: DAY, fixedRouteClient: CLIENT, palletOn: true })
  assert.equal(line.text, '운송료 합계 475,000원')
})

test('파렛트 꺼진 거래처면 파렛트를 뺀다', async () => {
  const line = await renderLine({ draft: DAY, fixedRouteClient: { ...CLIENT, palletOn: false }, palletOn: false })
  assert.equal(line.text, '운송료 합계 450,000원')
})

test('0원·휴무면 줄 자리는 남고 보이는 글은 없다', async () => {
  const empty = await renderLine({ draft: { isOff: false, fixedCount: 0, palletCount: 0, callDetails: [] }, fixedRouteClient: CLIENT, palletOn: true })
  assert.deepEqual(empty, { found: true, text: '' })
  const off = await renderLine({ draft: { ...DAY, isOff: true }, fixedRouteClient: CLIENT, palletOn: true })
  assert.deepEqual(off, { found: true, text: '' })
})
