// 로드맵 26 — 연동 기사: 계약기간 밖 날짜 일지는 입력칸 대신 안내, 소속 연결 카드에 계약기간.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { MemoryRouter } = await import('react-router-dom')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { commitDrivers } = await import('../../../data/store/commitHelpers.ts')
const { default: DayLogPage } = await import('./DayLogPage.jsx')
const { default: EmployerLinkCard } = await import('../../drivers/ui/EmployerLinkCard.jsx')

const OWNER = 'owner-period'
commitDrivers(OWNER, [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '34나5678', startDate: '2026-10-05', endDate: '2026-12-31', status: 'linked' }])

/** @param {import('react').ReactElement} element */
async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(MemoryRouter, null, element)) })
  return {
    text: () => container.textContent || '',
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** @param {string} dateKey @param {boolean} isEmployedDriver */
function dayLog(dateKey, isEmployedDriver) {
  const [, m, d] = dateKey.split('-')
  return withSession(React.createElement(DayLogPage, {
    month: Number(m), day: Number(d), dateKey, clients: [],
    settings: normalizeSettings({ fixedOn: true }), isEmployedDriver,
  }), { ownerKey: OWNER })
}

test('연동 기사 + 시작일 전 날짜: 입력칸 대신 안내', async () => {
  const view = await render(dayLog('2026-10-01', true))
  try {
    assert.ok(view.text().includes('계약기간 전 날짜입니다.'))
    assert.ok(view.text().includes('10월 5일부터 기록할 수 있습니다.'))
    assert.ok(view.text().includes('10월 1일 운행일지'), '제목은 그대로')
    assert.ok(!view.text().includes('고정 노선'), '입력칸 없음')
  } finally {
    await view.cleanup()
  }
})

test('연동 기사 + 기간 안 날짜: 지금처럼 입력칸', async () => {
  const view = await render(dayLog('2026-10-06', true))
  try {
    assert.ok(view.text().includes('고정 노선'))
    assert.ok(!view.text().includes('계약기간'))
  } finally {
    await view.cleanup()
  }
})

test('차주 계정은 날짜 상관없이 입력칸', async () => {
  const view = await render(dayLog('2026-10-01', false))
  try {
    assert.ok(view.text().includes('고정 노선'))
    assert.ok(!view.text().includes('계약기간'))
  } finally {
    await view.cleanup()
  }
})

test('소속 연결 카드에 계약기간(로드맵 47-A, 옛 "배정 기간")', async () => {
  const view = await render(withSession(React.createElement(EmployerLinkCard, {}), { ownerKey: OWNER, session: { userId: 'driver-1', name: '김기사' } }))
  try {
    assert.ok(view.text().includes('계약기간 2026-10-05 ~ 2026-12-31'), view.text())
  } finally {
    await view.cleanup()
  }
})
