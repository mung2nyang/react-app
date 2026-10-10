// 알림 화면 — 목록·날짜 줄·누르면 해당 화면·[닫기], 종류별 끄기(저장 실패면 안내 + 값 그대로),
// 일상점검 의무화 [바로 사용하기]/[다시 보지 않기](옛 옆 창 NotificationPanel 테스트를 옮김).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter } = await import('react-router-dom')
const { act } = React
const { default: NotificationsPage } = await import('./NotificationsPage.jsx')
const { collectNotifications, DAILY_INSPECTION_NOTICE_ID } = await import('../../lib/notifications.js')
const { commitSettings, commitWorkData } = await import('../../store/commitHelpers.js')
const { readOwnerSettings } = await import('../../store/ownerDataHooks.js')
const { normalizeSettings } = await import('../../domain/practiceSettings.js')

/**
 * @param {string} ownerKey
 * @param {{ onOpenPage?: (page: string) => void, onChanged?: () => void, showToast?: (m: string) => void }} [more]
 */
async function renderPage(ownerKey, more = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(
      MemoryRouter,
      { initialEntries: ['/app/notifications'] },
      React.createElement(NotificationsPage, {
        ownerKey,
        onBack: () => {},
        onOpenPage: more.onOpenPage || (() => {}),
        onChanged: more.onChanged,
        showToast: more.showToast,
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

/** @param {HTMLElement} container @param {string} text */
function itemWith(container, text) {
  return [...container.querySelectorAll('.notif-item')].find((el) => el.textContent?.includes(text))
}

/** @param {HTMLElement} container @param {string} kind */
function switchOf(container, kind) {
  const input = container.querySelector(`#notif-${kind}`)
  return input instanceof window.HTMLInputElement ? input : null
}

/** 입금 예정일이 지난 미수 1건(연체 알림) */
function seedOverdue(ownerKey) {
  commitSettings(ownerKey, normalizeSettings({ paymentOn: true }), { syncToCloud: false })
  commitWorkData(ownerKey, {
    '2026-08-30': { isOff: false, callDetails: [{ id: 'od-1', client: '연체거래처', fare: 120000, payments: [], paymentDueDate: '2026-09-01' }] },
  }, { syncToCloud: false })
}

test('목록: 연체 알림에 날짜 줄(운행·입금 예정), 누르면 미수금 화면, [닫기]하면 사라지고 🔔 다시 세기', async () => {
  const ownerKey = 'np-list'
  seedOverdue(ownerKey)
  /** @type {string[]} */
  const opened = []
  let changed = 0
  const view = await renderPage(ownerKey, { onOpenPage: (page) => opened.push(page), onChanged: () => { changed += 1 } })
  try {
    const item = itemWith(view.container, '연체 미수금 · 연체거래처')
    assert.ok(item, '연체 알림이 있어야 한다')
    assert.equal(item.querySelector('.notif-item-date')?.textContent, '운행 08.30 · 입금 예정 09.01')
    await act(async () => { item.querySelector('.notif-item-copy')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    assert.deepEqual(opened, ['receivables'])

    const dismiss = [...item.querySelectorAll('button')].find((el) => el.textContent === '닫기')
    assert.ok(dismiss)
    await act(async () => { dismiss.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    assert.equal(itemWith(view.container, '연체거래처'), undefined, '닫으면 목록에서 사라져야 한다')
    assert.equal(changed, 1, '🔔 숫자를 다시 세게 알려야 한다')
  } finally {
    await view.cleanup()
  }
})

test('알림이 없으면 "알림이 없습니다."', async () => {
  const ownerKey = 'np-empty'
  // 오후 6시 이후엔 "오늘 운행일지 비어 있음"이 생기므로 그 종류는 꺼 두고 본다(시간에 따라 흔들리지 않게).
  commitSettings(ownerKey, normalizeSettings({ dailyInspectionOn: true, notifOff: ['today'] }), { syncToCloud: false })
  const view = await renderPage(ownerKey)
  try {
    assert.equal(view.container.querySelector('.notif-list .empty-state')?.textContent, '알림이 없습니다.')
  } finally {
    await view.cleanup()
  }
})

test('끄기: 연체 미수금 스위치를 끄면 목록·🔔 계산에서 빠지고, 다시 켜면 돌아온다', async () => {
  const ownerKey = 'np-toggle'
  seedOverdue(ownerKey)
  let changed = 0
  const view = await renderPage(ownerKey, { onChanged: () => { changed += 1 } })
  try {
    const sw = switchOf(view.container, 'overdue')
    assert.ok(sw)
    assert.equal(sw.checked, true)
    await act(async () => { sw.click() })
    assert.deepEqual(readOwnerSettings(ownerKey).notifOff, ['overdue'])
    assert.equal(switchOf(view.container, 'overdue')?.checked, false)
    assert.equal(itemWith(view.container, '연체거래처'), undefined, '끈 종류는 목록에서 빠져야 한다')
    assert.equal(collectNotifications(ownerKey).some((item) => item.kind === 'overdue'), false, '🔔 숫자 계산에서도 빠져야 한다')
    assert.equal(changed, 1)

    await act(async () => { switchOf(view.container, 'overdue')?.click() })
    assert.deepEqual(readOwnerSettings(ownerKey).notifOff, [])
    assert.ok(itemWith(view.container, '연체거래처'), '다시 켜면 돌아와야 한다')
  } finally {
    await view.cleanup()
  }
})

test('계정에 맞는 스위치만: 비회원은 백업 권장(기사 초대 없음), 로그인 차주는 기사 초대(백업 없음)', async () => {
  const guest = await renderPage('guest')
  try {
    assert.ok(switchOf(guest.container, 'backup'))
    assert.equal(switchOf(guest.container, 'driverInvite'), null)
  } finally {
    await guest.cleanup()
  }
  const owner = await renderPage('np-owner-kinds')
  try {
    assert.ok(switchOf(owner.container, 'driverInvite'))
    assert.equal(switchOf(owner.container, 'backup'), null)
    assert.ok(switchOf(owner.container, 'overdue') && switchOf(owner.container, 'today'))
  } finally {
    await owner.cleanup()
  }
})

test('저장 실패면 안내가 뜨고 스위치·설정은 그대로', async () => {
  const ownerKey = 'np-save-fail'
  seedOverdue(ownerKey)
  /** @type {string[]} */
  const toasts = []
  const view = await renderPage(ownerKey, { showToast: (m) => toasts.push(m) })
  const setItem = mock.method(Object.getPrototypeOf(localStorage), 'setItem', () => { throw new Error('quota exceeded (simulated)') })
  try {
    await act(async () => { switchOf(view.container, 'overdue')?.click() })
    assert.deepEqual(toasts, ['저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'])
    assert.deepEqual(readOwnerSettings(ownerKey).notifOff, [], '설정은 바뀌면 안 된다')
    assert.equal(switchOf(view.container, 'overdue')?.checked, true, '스위치도 켜진 그대로')
    assert.ok(itemWith(view.container, '연체거래처'), '알림도 그대로')
  } finally {
    setItem.mock.restore()
    await view.cleanup()
  }
})

test('일상점검 의무화 안내: [바로 사용하기] = 스위치 켜짐 → 목록에서 사라짐, 닫기 이름은 [다시 보지 않기], 끄기 스위치 없음', async () => {
  const ownerKey = 'np-inspection'
  commitSettings(ownerKey, normalizeSettings({}), { syncToCloud: false })
  /** @type {string[]} */
  const toasts = []
  const view = await renderPage(ownerKey, { showToast: (m) => toasts.push(m) })
  try {
    assert.equal(switchOf(view.container, 'inspectionRequired'), null, '법령 안내라 끄기 스위치가 없어야 한다')
    const item = itemWith(view.container, '일상점검표가 의무화되었습니다')
    assert.ok(item, '의무화 알림이 있어야 한다')
    const labels = [...item.querySelectorAll('button')].map((el) => el.textContent?.trim())
    assert.ok(labels.includes('바로 사용하기'))
    assert.ok(labels.includes('다시 보지 않기'))
    const action = [...item.querySelectorAll('button')].find((el) => el.textContent?.trim() === '바로 사용하기')
    assert.ok(action instanceof window.HTMLButtonElement)
    await act(async () => { action.click() })
    await act(async () => { await Promise.resolve() })
    assert.equal(readOwnerSettings(ownerKey).dailyInspectionOn, true)
    assert.equal(collectNotifications(ownerKey).some((n) => n.id === DAILY_INSPECTION_NOTICE_ID), false)
    assert.equal(itemWith(view.container, '일상점검표가 의무화되었습니다'), undefined)
    assert.deepEqual(toasts, ['일상점검표를 켰습니다.'])
  } finally {
    await view.cleanup()
  }
})
