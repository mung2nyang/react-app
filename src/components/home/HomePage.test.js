// 새 홈 1·2단계 — 오늘 카드(기록 없음/횟수/휴무, 운행 줄), 할 일(일상점검·미수), 이번 달 정산 합계 = 달력 합계.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

/** @type {import('../../lib/dailyInspections.js').DailyInspection|null} */
let serverInspection = null
let inspectionFetches = 0
mock.module('../../lib/dailyInspections.js', {
  namedExports: {
    fetchDailyInspection: async () => { inspectionFetches += 1; return serverInspection },
  },
})
beforeEach(() => { serverInspection = null; inspectionFetches = 0 })

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter } = await import('react-router-dom')
const { act } = React
const { default: HomePage } = await import('./HomePage.jsx')
const { default: CalendarPage } = await import('../calendar/CalendarPage.jsx')
const { commitCars, commitClients, commitExpenses, commitSettings, commitWorkData } = await import('../../store/commitHelpers.js')
const { todayWorkLogSelection } = await import('../../domain/calendar.js')
const { normalizeSettings } = await import('../../domain/practiceSettings.js')
const { allGoodItems } = await import('../../domain/dailyInspectionItems.js')

/**
 * @param {string} ownerKey
 * @param {(dateKey: string) => void} onOpenToday
 * @param {{ onOpenReceivables?: () => void, onOpenCalendar?: () => void }} [more]
 */
async function renderHome(ownerKey, onOpenToday, more = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(
      MemoryRouter,
      { initialEntries: ['/app'] },
      React.createElement(HomePage, {
        ownerKey, onOpenToday, onOpenMenu: () => {}, onOpenNotifs: () => {},
        onOpenReceivables: more.onOpenReceivables || (() => {}), onOpenCalendar: more.onOpenCalendar || (() => {}),
      }),
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
    const actions = Array.from(view.container.querySelectorAll('.app-topbar-actions button')).map((btn) => btn.title)
    assert.deepEqual(actions, ['알림', '메뉴'], '오른쪽에 알림 종 다음 메뉴가 있어야 한다')
    assert.ok(view.container.querySelector('.app-brand')?.textContent.includes('운행일지'), '왼쪽에 작은 로고가 있어야 한다')
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

/** @param {HTMLElement} container @param {string} selector */
function texts(container, selector) {
  // 줄 안 칸(span)끼리는 띄어서 읽음
  return Array.from(container.querySelectorAll(selector)).map((el) => {
    const parts = el.children.length ? Array.from(el.children).map((child) => child.textContent || '') : [el.textContent || '']
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  })
}

test('2단계 — 운행 줄: 고정 노선 + 콜 최대 3줄 + "외 N건", 제목에 오늘 운송료', async () => {
  const ownerKey = 'test-home-trips'
  const { dateKey } = todayWorkLogSelection()
  commitWorkData(ownerKey, {
    [dateKey]: {
      isOff: false,
      fixedCount: 2,
      callDetails: [
        { id: 'c1', loadLoc: '평택', unloadLoc: '이천', fare: '150,000' },
        { id: 'c2', loadLoc: '', unloadLoc: '용인', fare: 130000 },
        { id: 'c3', loadLoc: '용인', unloadLoc: '평택', fare: 140000 },
        { id: 'c4', loadLoc: '평택', unloadLoc: '안성', fare: 90000 },
      ],
    },
  }, { syncToCloud: false })
  const view = await renderHome(ownerKey, () => {})
  try {
    assert.deepEqual(texts(view.container, '.home-trip-row'), [
      '고정 노선 2회',
      '평택 → 이천 150,000원',
      '상차지 없음 → 용인 130,000원',
      '용인 → 평택 140,000원',
    ])
    assert.deepEqual(texts(view.container, '.home-trip-more'), ['외 1건'])
    const status = view.container.querySelector('.home-today-status')?.textContent || ''
    assert.ok(status.startsWith('오늘 6회 · 510,000원'), `제목 — 실제: ${status}`)
  } finally {
    await view.cleanup()
  }
})

test('2단계 — 할 일: 미수 건수·남은 금액(입금 완료 제외), 누르면 미수금 열기, 없으면 "할 일 없음"', async () => {
  const ownerKey = 'test-home-unpaid'
  const view0 = await renderHome(ownerKey, () => {})
  try {
    assert.equal(view0.container.querySelector('.home-todo-empty')?.textContent, '할 일 없음')
  } finally {
    await view0.cleanup()
  }

  commitSettings(ownerKey, normalizeSettings({ paymentOn: true }), { syncToCloud: false })
  commitWorkData(ownerKey, {
    '2026-09-03': {
      isOff: false,
      callDetails: [
        { id: 'u1', client: 'A', fare: 100000, payments: [] },
        { id: 'u2', client: 'A', fare: 50000, payments: [{ id: 'p1', amount: 20000 }] },
        { id: 'u3', client: 'B', fare: 70000, payments: [{ id: 'p2', amount: 70000 }] },
      ],
    },
  }, { syncToCloud: false })
  let opened = 0
  const view = await renderHome(ownerKey, () => {}, { onOpenReceivables: () => { opened += 1 } })
  try {
    assert.deepEqual(texts(view.container, '.home-todo-row'), ['미수 2건 · 130,000원 ›'])
    await act(async () => {
      view.container.querySelector('.home-todo-row')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(opened, 1)
  } finally {
    await view.cleanup()
  }
})

test('2단계 — 할 일: 일상점검 켜짐·서버에 오늘 점검표 없음이면 "오늘 일상점검 안 함" → 오늘 일지, 있으면 안 보임', async () => {
  const ownerKey = 'test-home-inspection'
  const { dateKey } = todayWorkLogSelection()
  commitCars(ownerKey, [{ id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main' }], { syncToCloud: false })
  commitSettings(ownerKey, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  /** @type {string[]} */
  const opened = []
  const view = await renderHome(ownerKey, (key) => opened.push(key))
  try {
    await act(async () => { await Promise.resolve() })
    assert.equal(inspectionFetches, 1, '서버에 한 번 물어봐야 한다')
    assert.deepEqual(texts(view.container, '.home-todo-row'), ['오늘 일상점검 안 함 ›'])
    await act(async () => {
      view.container.querySelector('.home-todo-row')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.deepEqual(opened, [dateKey])
  } finally {
    await view.cleanup()
  }

  serverInspection = { items: allGoodItems(), actionNote: '', inspectorName: '' }
  const done = await renderHome(ownerKey, () => {})
  try {
    await act(async () => { await Promise.resolve() })
    assert.equal(done.container.querySelector('.home-todo-row'), null, '이미 작성했으면 안 보여야 한다')
    assert.equal(done.container.querySelector('.home-todo-empty')?.textContent, '할 일 없음')
  } finally {
    await done.cleanup()
  }
})

test('2단계 — 이번 달 정산 합계 = 운행 탭 달력 "합계", 거래처 단가가 바뀌면 둘 다 같이 바뀜', async () => {
  const ownerKey = 'test-home-month'
  const now = new Date()
  const { dateKey } = todayWorkLogSelection(now)
  commitClients(ownerKey, [{ id: 'cl-1', companyName: '고정거래처', fixedRouteLinked: true, fixedUnitPrice: 10000 }], { syncToCloud: false })
  commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 3, callDetails: [{ id: 'm1', client: '고정거래처', fare: 50000 }] } }, { syncToCloud: false })
  let openedCalendar = 0
  const home = await renderHome(ownerKey, () => {}, { onOpenCalendar: () => { openedCalendar += 1 } })
  const calContainer = document.createElement('div')
  document.body.appendChild(calContainer)
  const calRoot = createRoot(calContainer)
  try {
    await act(async () => {
      calRoot.render(React.createElement(
        MemoryRouter,
        { initialEntries: [`/app/calendar?y=${now.getFullYear()}&m=${now.getMonth()}`] },
        React.createElement(CalendarPage, { ownerKey, onSelectDay: () => {} }),
      ))
    })
    const calendarTotal = () => calContainer.querySelector('.summary-row.total .summary-value')?.textContent
    const homeTotal = () => home.container.querySelector('.home-month-total')?.textContent
    assert.ok(calendarTotal(), '달력 합계 줄을 찾아야 한다')
    assert.equal(homeTotal(), calendarTotal())
    assert.notEqual(homeTotal(), '0원', '0원끼리 같은 걸로 통과하면 안 된다')

    const before = homeTotal()
    await act(async () => {
      commitClients(ownerKey, [{ id: 'cl-1', companyName: '고정거래처', fixedRouteLinked: true, fixedUnitPrice: 20000 }], { syncToCloud: false })
    })
    assert.notEqual(homeTotal(), before, '단가가 바뀌면 홈 합계도 바뀌어야 한다')
    assert.equal(homeTotal(), calendarTotal(), '단가가 바뀐 뒤에도 같아야 한다')

    await act(async () => {
      home.container.querySelector('.home-month-card')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(openedCalendar, 1)
  } finally {
    await act(async () => { calRoot.unmount() })
    calContainer.remove()
    await home.cleanup()
  }
})

test('바로 수정 — 이번 달 지출이 있으면 정산 합계 아래 "이번 달 지출 합계"(달력의 정비·주유·통행료/기타 합), 없으면 안 보임', async () => {
  const ownerKey = 'test-home-expense'
  const now = new Date()
  const { dateKey } = todayWorkLogSelection(now)
  const none = await renderHome(ownerKey, () => {})
  try {
    assert.equal(none.container.querySelector('.home-month-expense'), null)
  } finally {
    await none.cleanup()
  }
  commitExpenses(ownerKey, [
    { id: 'e1', kind: 'maint', date: dateKey, cost: 30000 },
    { id: 'e2', kind: 'fuel', date: dateKey, cost: 50000 },
    { id: 'e3', kind: 'misc', date: dateKey, cost: 7000 },
  ], { syncToCloud: false })
  const view = await renderHome(ownerKey, () => {})
  try {
    assert.equal(view.container.querySelector('.home-month-expense')?.textContent, '이번 달 지출 합계 87,000원')
  } finally {
    await view.cleanup()
  }
})

test('AI 비서 1단계 — 오늘 카드와 할 일 사이에 운비서 줄(그림·이름·안내·마이크), 아직 누르는 버튼 아님', async () => {
  const view = await renderHome('test-home-assistant', () => {})
  try {
    const cards = Array.from(view.container.querySelectorAll('.home-card'))
    const order = cards.map((el) => (
      el.classList.contains('home-today-card') ? 'today'
        : el.classList.contains('home-assistant') ? 'assistant'
          : el.classList.contains('home-todo-empty') || el.classList.contains('home-todo-card') ? 'todo'
            : el.classList.contains('home-month-card') ? 'month' : 'other'
    ))
    assert.deepEqual(order, ['today', 'assistant', 'todo', 'month'])
    const bar = view.container.querySelector('.home-assistant')
    assert.ok(bar?.querySelector('img[src$="assistant_unbiseo.png"]'), '비서 얼굴 그림')
    assert.equal(bar?.querySelector('.home-assistant-name')?.textContent, '운비서')
    assert.equal(bar?.querySelector('.home-assistant-hint')?.textContent, '무엇이든 물어보세요')
    assert.ok(bar?.querySelector('svg.home-assistant-mic'), '마이크는 선 그림 SVG')
    assert.equal(bar?.querySelector('button'), null, '동작 연결 전이라 버튼이 없어야 한다')
    assert.equal(bar?.tagName, 'SECTION')
  } finally {
    await view.cleanup()
  }
})
