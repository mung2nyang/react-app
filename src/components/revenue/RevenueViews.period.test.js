// 로드맵 58-B — 차주·연동 기사 매출 화면의 같은 부분: 달·해 이동, 년/월 단추, 12달 순이익 목록과 합계.
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
const { default: DriverRevenueView } = await import('./DriverRevenueView.jsx')
const { commitCars, commitExpenses } = await import('../../store/commitHelpers.js')

const now = new Date()
const YEAR = now.getFullYear()
const MONTH = now.getMonth()
const DATE_KEY = `${YEAR}-${String(MONTH + 1).padStart(2, '0')}-15`

/** @param {typeof OwnerRevenueView} View @param {string} ownerKey */
async function mount(View, ownerKey) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(View, { ownerKey })) })
  return {
    container,
    picked: () => [...container.querySelectorAll('.date-navigator .app-dropdown-trigger')].map((el) => el.textContent?.trim()).join(' '),
    rows: () => [...container.querySelectorAll('.revenue-year-row')].map((row) => [...row.querySelectorAll('span')].map((span) => `${span.textContent}${span.className ? `[${span.className}]` : ''}`).join(' ')),
    total: () => {
      const box = container.querySelector('.revenue-year-total')
      const strong = box?.querySelector('strong')
      return `${box?.querySelector('span')?.textContent} ${strong?.textContent}${strong?.className ? `[${strong.className}]` : ''}`
    },
    async press(/** @type {string} */ label) {
      const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === label || el.title === label)
      assert.ok(button, `${label} 버튼`)
      await act(async () => { button.click() })
    },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** 이번 달 다음 달 이름(12월이면 1월). */
const nextMonthLabel = `${((MONTH + 1) % 12) + 1}월`

/** @param {Awaited<ReturnType<typeof mount>>} view */
async function checkPeriod(view) {
  assert.equal(view.picked(), `${YEAR}년 ${MONTH + 1}월`)
  await view.press('다음 달')
  assert.ok(view.picked().endsWith(nextMonthLabel))
  await view.press('이전 달')
  assert.equal(view.picked(), `${YEAR}년 ${MONTH + 1}월`)

  await view.press('년 매출')
  assert.equal(view.picked(), `${YEAR}년`)
  assert.equal(view.rows().length, 12)
  assert.ok(view.total().startsWith(`${YEAR}년 순이익 합계`))
  await view.press('다음 해')
  assert.equal(view.picked(), `${YEAR + 1}년`)
  assert.ok(view.total().startsWith(`${YEAR + 1}년 순이익 합계`))
  await view.press('이전 해')
  await view.press('월 매출')
  assert.equal(view.container.querySelector('.revenue-year-list'), null)
}

test('차주 매출: 달·해 이동, 년 매출 12줄·합계, 손해 달·합계 빨강', async () => {
  const ownerKey = 'revenue-58b-owner'
  commitCars(ownerKey, [{ id: 'c-main', type: 'main', number: '11가1111' }])
  commitExpenses(ownerKey, [{ id: 'm-1', kind: 'maint', date: DATE_KEY, name: '정비', cost: 12345 }])
  const view = await mount(OwnerRevenueView, ownerKey)
  try {
    await checkPeriod(view)
    await view.press('년 매출')
    assert.deepEqual(view.rows(), Array.from({ length: 12 }, (_, index) => (index === MONTH ? `${index + 1}월 -12,345원[negative]` : `${index + 1}월 0원`)))
    assert.equal(view.total(), `${YEAR}년 순이익 합계 -12,345원[negative]`)
    assert.ok(view.container.querySelector('.revenue-scope-tabs'), '차주만 범위 탭')
  } finally { await view.cleanup() }
})

test('연동 기사 매출: 달·해 이동, 년 매출 12줄·합계, 범위 탭 없음', async () => {
  const ownerKey = 'revenue-58b-driver'
  commitCars(ownerKey, [{ id: 'c-sub', type: 'sub', number: '22가2222' }])
  const view = await mount(DriverRevenueView, ownerKey)
  try {
    await checkPeriod(view)
    await view.press('년 매출')
    assert.deepEqual(view.rows(), Array.from({ length: 12 }, (_, index) => `${index + 1}월 0원`))
    assert.equal(view.total(), `${YEAR}년 순이익 합계 0원`)
    assert.equal(view.container.querySelector('.revenue-scope-tabs'), null)
  } finally { await view.cleanup() }
})
