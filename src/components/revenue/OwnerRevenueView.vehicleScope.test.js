import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: OwnerRevenueView } = await import('./OwnerRevenueView.jsx')
const { commitCars, commitExpenses } = await import('../../store/commitHelpers.js')

/** @param {HTMLElement} container @param {string} text */
function clickButton(container, text) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)
  assert.ok(button, `${text} 버튼이 있어야 한다`)
  button.click()
}

test('로드맵 5-A-2: 서브 표시 비용은 "차주" 탭이 아니라 "기사" 탭에, 기사를 고르면 그 차량 것만 센다', async () => {
  const ownerKey = 'revenue-5a2-vehicle-scope'
  const now = new Date()
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`
  commitCars(ownerKey, [
    { id: 'c-main', type: 'main', number: '11가1111' },
    { id: 'c-sub-a', type: 'sub', number: '22가2222', driverName: '가기사' },
    { id: 'c-sub-b', type: 'sub', number: '33가3333', driverName: '나기사' },
  ], { syncToCloud: false })
  commitExpenses(ownerKey, [
    { id: 'm-main', kind: 'maint', date: dateKey, name: '메인정비', cost: 12345 },
    { id: 'm-sub-a', kind: 'maint', date: dateKey, name: '서브A정비', cost: 777, vehicleNumber: '22가2222' },
    { id: 'm-sub-b', kind: 'maint', date: dateKey, name: '서브B정비', cost: 888, vehicleNumber: '33가3333' },
  ], { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { root.render(React.createElement(OwnerRevenueView, { ownerKey })) })
    const ownerText = container.textContent || ''
    assert.ok(ownerText.includes('-12,345원'), '"차주" 탭 정비 = 메인 것만')
    assert.equal(ownerText.includes('13,1'), false, '"차주" 탭에 서브 비용이 더해지면 안 된다')

    await act(async () => { clickButton(container, '기사') })
    assert.ok((container.textContent || '').includes('-1,665원'), '"기사" 탭 전체 = 서브A 777 + 서브B 888')

    const trigger = container.querySelector('.app-dropdown-trigger[aria-label="기사 선택"]')
    assert.ok(trigger instanceof window.HTMLButtonElement, '기사 선택 드롭다운이 있어야 한다')
    await act(async () => { trigger.click() })
    const option = [...container.querySelectorAll('[role="option"]')].find((item) => item.textContent?.includes('22가2222'))
    assert.ok(option instanceof window.HTMLButtonElement, '서브A 선택지가 있어야 한다')
    await act(async () => { option.click() })
    const pickedText = container.textContent || ''
    assert.ok(pickedText.includes('-777원'), '서브A를 고르면 서브A 정비만')
    assert.equal(pickedText.includes('1,665'), false, '다른 서브 비용이 섞이면 안 된다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
