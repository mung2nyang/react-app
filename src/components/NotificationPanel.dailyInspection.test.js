// 로드맵 9-B-1 — 알림 카드의 [바로 사용하기]·[다시 보지 않기] 버튼: 바로 사용하기 = 메인 스위치 켜기 → 알림이 사라짐.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: NotificationPanel } = await import('./NotificationPanel.jsx')
const { collectNotifications, DAILY_INSPECTION_NOTICE_ID } = await import('../lib/notifications.js')
const { savePracticeSettings } = await import('../lib/practiceSettings.js')
const { commitSettings } = await import('../store/commitHelpers.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

test('[바로 사용하기]를 누르면 메인 스위치가 켜지고 알림 목록에서 사라진다, 닫기 버튼 이름은 [다시 보지 않기]', async () => {
  const ownerKey = 'di-panel-1'
  commitSettings(ownerKey, normalizeSettings({}), { syncToCloud: false })
  /** @type {Array<string>} */
  const dismissed = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(NotificationPanel, {
        open: true,
        items: collectNotifications(ownerKey),
        onClose: () => {},
        onOpenItem: () => {},
        onDismiss: (/** @type {string} */ id) => { dismissed.push(id) },
        onAction: () => { void savePracticeSettings(ownerKey, { dailyInspectionOn: true }) },
      }))
    })
    const card = [...container.querySelectorAll('.notification-card')].find((el) => el.textContent?.includes('일상점검표가 의무화되었습니다'))
    assert.ok(card, '의무화 알림 카드가 있어야 한다')
    const labels = [...card.querySelectorAll('button')].map((el) => el.textContent?.trim())
    assert.ok(labels.includes('바로 사용하기'))
    assert.ok(labels.includes('다시 보지 않기'))
    const action = [...card.querySelectorAll('button')].find((el) => el.textContent?.trim() === '바로 사용하기')
    assert.ok(action instanceof window.HTMLButtonElement)
    await act(async () => { action.click() })
    assert.equal(collectNotifications(ownerKey).some((item) => item.id === DAILY_INSPECTION_NOTICE_ID), false)
    assert.deepEqual(dismissed, [])
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
