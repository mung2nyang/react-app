// 차량 목록 카드 글씨 — 기사 차량 수수료는 비율만 보이고, 옛 건당 자료는 수수료 글씨가 없다.
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
const { default: CarListItem } = await import('./CarListItem.jsx')

const SUB = { type: 'sub', number: '12가3456', tonnage: '5톤', driverPayMode: 'revenue', commEnabled: true }

/** @param {object} car */
async function subText(car) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(CarListItem, { car })) })
  const text = container.querySelector('.car-sub-text')?.textContent || ''
  await act(async () => { root.unmount() })
  container.remove()
  return text
}

test('비율 수수료는 ", 수수료 N%"', async () => {
  assert.equal(await subText({ ...SUB, commType: 'percent', commission: '10' }), '(5톤), 수수료 10%')
})

test('옛 건당 자료는 수수료 글씨 없음', async () => {
  assert.equal(await subText({ ...SUB, commType: 'direct', commission: '5000' }), '(5톤)')
})
