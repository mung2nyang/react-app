// 로드맵 26 — 연동 기사: 배정 기간 밖 날짜 일지는 입력칸 대신 안내, 소속 연결 카드에 배정 기간.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { MemoryRouter } = await import('react-router-dom')
const { normalizeSettings } = await import('../../domain/practiceSettings.js')
const { commitDrivers } = await import('../../store/commitHelpers.js')
const { assignmentPeriodNotice } = await import('./AssignmentPeriodPage.jsx')
const { default: DayLogPage } = await import('./DayLogPage.jsx')
const { default: EmployerLinkCard } = await import('../drivers/EmployerLinkCard.jsx')

const OWNER = 'owner-period'
commitDrivers(OWNER, [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '34나5678', startDate: '2026-10-05', endDate: '2026-12-31', status: 'linked' }], { syncToCloud: false })

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
  return React.createElement(DayLogPage, {
    month: Number(m), day: Number(d), dateKey, ownerKey: OWNER, clients: [],
    settings: normalizeSettings({ fixedOn: true }), showToast: () => {}, isEmployedDriver,
  })
}

test('문구: 시작일 전·종료일 뒤만 안내, 기간 안·기간 없음은 null, 해가 다르면 해까지', () => {
  assert.deepEqual(assignmentPeriodNotice('2026-10-01', '2026-10-05', ''), { title: '배정 기간 전 날짜입니다.', body: '10월 5일부터 기록할 수 있습니다.' })
  assert.deepEqual(assignmentPeriodNotice('2027-01-02', '2026-10-05', '2026-12-31'), { title: '배정 기간이 끝난 날짜입니다.', body: '2026년 12월 31일까지 기록할 수 있습니다.' })
  assert.equal(assignmentPeriodNotice('2026-10-05', '2026-10-05', '2026-12-31'), null, '시작일 당일')
  assert.equal(assignmentPeriodNotice('2026-12-31', '2026-10-05', '2026-12-31'), null, '종료일 당일')
  assert.equal(assignmentPeriodNotice('2020-01-01', '', ''), null, '기간 없음')
})

test('연동 기사 + 시작일 전 날짜: 입력칸 대신 안내', async () => {
  const view = await render(dayLog('2026-10-01', true))
  try {
    assert.ok(view.text().includes('배정 기간 전 날짜입니다.'))
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
    assert.ok(!view.text().includes('배정 기간'))
  } finally {
    await view.cleanup()
  }
})

test('차주 계정은 날짜 상관없이 입력칸', async () => {
  const view = await render(dayLog('2026-10-01', false))
  try {
    assert.ok(view.text().includes('고정 노선'))
    assert.ok(!view.text().includes('배정 기간'))
  } finally {
    await view.cleanup()
  }
})

test('소속 연결 카드에 배정 기간', async () => {
  const view = await render(React.createElement(EmployerLinkCard, { ownerKey: OWNER, session: { userId: 'driver-1', name: '김기사' } }))
  try {
    assert.ok(view.text().includes('배정 기간 2026-10-05 ~ 2026-12-31'), view.text())
  } finally {
    await view.cleanup()
  }
})
