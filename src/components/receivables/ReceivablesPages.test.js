// 로드맵 47-B — 미수금 화면: 연동 기사 계정은 차량 배지 없음(차주는 그대로), 남은 건 0건 안내.
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
const { MemoryRouter, Route, Routes } = await import('react-router-dom')
const { act } = React
const { default: ReceivablesPage } = await import('../ReceivablesPage.jsx')
const { commitCars, commitWorkData } = await import('../../store/commitHelpers.js')

/**
 * @param {string} ownerKey
 * @param {string} path
 * @param {boolean} isEmployedDriver
 */
async function renderAt(ownerKey, path, isEmployedDriver) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, {
        path: '/app/receivables/*',
        element: React.createElement(ReceivablesPage, { ownerKey, isEmployedDriver }),
      })),
    ))
  })
  return {
    container,
    /** @returns {string[]} */
    badges: () => Array.from(container.querySelectorAll('.management-badge.car-type')).map((el) => el.textContent || ''),
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

/** @param {string} ownerKey @param {Array<object>} cars */
function seed(ownerKey, cars) {
  commitCars(ownerKey, cars, { syncToCloud: false })
  commitWorkData(ownerKey, {
    '2026-09-03': { isOff: false, callDetails: [{ id: 'u1', client: 'A', fare: 100000, payments: [] }] },
  }, { syncToCloud: false })
}

test('차주(기사 차량 있음): 목록·상세에 "메인 차량" 배지 그대로', async () => {
  const ownerKey = 'test-recv-owner'
  seed(ownerKey, [
    { id: 'c-main', type: 'main', number: '12가3456' },
    { id: 'c-sub', type: 'sub', number: '34나5678' },
  ])
  const list = await renderAt(ownerKey, '/app/receivables', false)
  try {
    assert.ok(list.badges().includes('메인 차량'), list.badges().join(','))
  } finally {
    await list.cleanup()
  }
  const detail = await renderAt(ownerKey, '/app/receivables/A/2026-09', false)
  try {
    assert.ok(detail.badges().includes('메인 차량'), detail.badges().join(','))
  } finally {
    await detail.cleanup()
  }
})

test('연동 기사 계정: 자기 차가 "메인 차량"으로 안 보이게 목록·상세 차량 배지 없음', async () => {
  const ownerKey = 'test-recv-driver'
  seed(ownerKey, [{ id: 'c-assigned', type: 'sub', number: '11가1111' }])
  const list = await renderAt(ownerKey, '/app/receivables', true)
  try {
    assert.ok((list.container.textContent || '').includes('A'), '미수 건은 그대로 보여야 한다')
    assert.deepEqual(list.badges(), [])
  } finally {
    await list.cleanup()
  }
  const detail = await renderAt(ownerKey, '/app/receivables/A/2026-09', true)
  try {
    assert.ok((detail.container.textContent || '').includes('100,000원'))
    assert.deepEqual(detail.badges(), [])
  } finally {
    await detail.cleanup()
  }
})

test('남은 건 0건(기록 없는 거래처)이면 "남은 미수금이 없습니다."', async () => {
  const ownerKey = 'test-recv-empty'
  seed(ownerKey, [{ id: 'c-main', type: 'main', number: '12가3456' }])
  const view = await renderAt(ownerKey, '/app/receivables/Z/2026-09', false)
  try {
    const text = view.container.textContent || ''
    assert.ok(text.includes('남은 미수금이 없습니다.'), text.slice(0, 300))
    assert.equal(text.includes('입금 완료 처리되었습니다'), false)
  } finally {
    await view.cleanup()
  }
})
