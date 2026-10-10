// 새 홈 1단계 — "오늘" 카드: 기록 없음/횟수/휴무 글자와 버튼, store 구독.
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
const { MemoryRouter } = await import('react-router-dom')
const { act } = React
const { default: HomePage } = await import('./HomePage.jsx')
const { commitWorkData } = await import('../../store/commitHelpers.js')
const { todayWorkLogSelection } = await import('../../domain/calendar.js')

/** @param {string} ownerKey @param {(dateKey: string) => void} onOpenToday */
async function renderHome(ownerKey, onOpenToday) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(
      MemoryRouter,
      { initialEntries: ['/app'] },
      React.createElement(HomePage, { ownerKey, onOpenToday, onOpenMenu: () => {}, onOpenNotifs: () => {} }),
    ))
  })
  return {
    container,
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

/** @param {HTMLElement} container */
function todayButton(container) {
  const button = container.querySelector('.home-today-btn')
  assert.ok(button instanceof window.HTMLButtonElement, '오늘 카드 버튼을 찾아야 한다')
  return button
}

test('기록이 없으면 "아직 기록이 없습니다" + [운행 기록하기], 누르면 오늘 날짜로 연다', async () => {
  const ownerKey = 'test-home-empty'
  const { dateKey, month, day } = todayWorkLogSelection()
  /** @type {string[]} */
  const opened = []
  const view = await renderHome(ownerKey, (key) => opened.push(key))
  try {
    const actions = Array.from(view.container.querySelectorAll('.home-topbar-actions button')).map((btn) => btn.title)
    assert.deepEqual(actions, ['알림', '메뉴'], '오른쪽에 알림 종 다음 메뉴가 있어야 한다')
    assert.ok(view.container.querySelector('.home-brand')?.textContent.includes('운행일지'), '왼쪽에 작은 로고가 있어야 한다')
    const card = view.container.querySelector('.home-today-card')
    assert.ok(card, '오늘 카드가 있어야 한다')
    assert.ok(card.textContent.includes(`${month}월 ${day}일`), `오늘 날짜가 보여야 한다 — 실제: ${card.textContent}`)
    assert.ok(card.textContent.includes('아직 기록이 없습니다'))
    assert.equal(todayButton(view.container).textContent, '운행 기록하기')

    await act(async () => {
      todayButton(view.container).dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.deepEqual(opened, [dateKey])
  } finally {
    await view.cleanup()
  }
})

test('오늘 기록이 생기면(store 구독) "오늘 3회" + [하나 더 기록]으로 바뀐다', async () => {
  const ownerKey = 'test-home-count'
  const { dateKey } = todayWorkLogSelection()
  const view = await renderHome(ownerKey, () => {})
  try {
    assert.ok(view.container.textContent.includes('아직 기록이 없습니다'))
    await act(async () => {
      commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 3, callDetails: [] } }, { syncToCloud: false })
    })
    assert.ok(view.container.textContent.includes('오늘 3회'), `실제: ${view.container.textContent}`)
    assert.equal(todayButton(view.container).textContent, '하나 더 기록')
  } finally {
    await view.cleanup()
  }
})

test('오늘을 휴무로 저장했으면 "오늘은 휴무입니다" + [일지 열기]', async () => {
  const ownerKey = 'test-home-off'
  const { dateKey } = todayWorkLogSelection()
  commitWorkData(ownerKey, { [dateKey]: { isOff: true, fixedCount: 0, callDetails: [] } }, { syncToCloud: false })
  const view = await renderHome(ownerKey, () => {})
  try {
    assert.ok(view.container.textContent.includes('오늘은 휴무입니다'))
    assert.equal(todayButton(view.container).textContent, '일지 열기')
  } finally {
    await view.cleanup()
  }
})
