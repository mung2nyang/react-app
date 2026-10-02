// 로드맵 9-C-1·9-D·세금계산서 정리 ② — 서류 발급(아래 9-C·9-D 테스트는 연동 기사 앱 화면 = 세금계산서 탭 없음으로 그림): 탭 보임/숨김(스위치·저장분), 처음 탭 [일상점검표], 표 칸(O/X/미/빈칸)·머리 칸, [운송비 내역서] 탭은 기존 화면.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

let hasAny = false
/** @type {Record<string, { items: Record<string, 'good'|'bad'>, actionNote: string, inspectorName: string }>} */
let monthRecords = {}
/** @type {Promise<typeof monthRecords>|null} */
let pendingFetch = null
mock.module('../../lib/dailyInspections.js', {
  namedExports: {
    hasAnyDailyInspection: async () => hasAny,
    fetchMonthDailyInspections: async () => (pendingFetch ? pendingFetch : monthRecords),
  },
})

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Route, Routes } = await import('react-router-dom')
const { act } = React
const { default: DocumentIssuePage } = await import('./DocumentIssuePage.jsx')
const { commitCars, commitInvoices, commitLogWorkData, commitProfile, commitSettings, commitWorkData } = await import('../../store/commitHelpers.js')
const { normalizeSettings } = await import('../../domain/practiceSettings.js')
const { EMPTY_PROFILE } = await import('../../lib/profile.js')
const { allGoodItems } = await import('../../domain/dailyInspectionItems.js')
const { todayKey } = await import('../../domain/expenses.js')

const OWNER = 'doc-issue-owner'

beforeEach(() => {
  hasAny = false
  monthRecords = {}
  commitCars(OWNER, [{ id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main' }], { syncToCloud: false })
  commitProfile(OWNER, { ...EMPTY_PROFILE, name: '김운행', bizRepresentative: '김대표' }, { syncToCloud: false })
  commitWorkData(OWNER, {}, { syncToCloud: false })
  commitInvoices(OWNER, [], { syncToCloud: false })
})

/** @param {{ path?: string, owner?: boolean }} [opts] owner = 차주(세금계산서 탭 있음), 기본은 연동 기사 앱 */
async function render({ path = '/report', owner = false } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    const page = React.createElement(DocumentIssuePage, { ownerKey: OWNER, onBack: () => {}, isEmployedDriver: !owner })
    root.render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/report', element: page }),
        React.createElement(Route, { path: '/logs/:logId/report', element: page }))))
  })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  return { container, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('스위치 꺼짐 + 저장분 없음 → 탭 줄 없이 운송비 내역서만, 제목 "서류 발급"', async () => {
  commitSettings(OWNER, normalizeSettings({}), { syncToCloud: false })
  const view = await render()
  try {
    assert.equal(!!view.container.querySelector('.doc-tabs'), false)
    assert.ok(view.container.querySelector('#reportContentToExport'), '운송비 내역서 내용')
    assert.equal(view.container.querySelector('.settings-title')?.textContent, '서류 발급')
  } finally {
    await view.cleanup()
  }
})

test('스위치 꺼짐이어도 서버에 점검표가 있으면 탭이 보임', async () => {
  commitSettings(OWNER, normalizeSettings({}), { syncToCloud: false })
  hasAny = true
  const view = await render()
  try {
    assert.ok(view.container.querySelector('.doc-tabs'))
  } finally {
    await view.cleanup()
  }
})

test('스위치 켜짐 → 처음 탭 [일상점검표]: 머리 칸·오늘 칸 O/X, 휴무 미 → [운송비 내역서] 탭 전환', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  const today = todayKey()
  monthRecords = { [today]: { items: { ...allGoodItems(), tires: 'bad' }, actionNote: '', inspectorName: '기사' } }
  const view = await render()
  try {
    const active = view.container.querySelector('.doc-tab.active')
    assert.equal(active?.textContent, '일상점검표')
    const head = view.container.querySelector('.doc-sheet-head')?.textContent || ''
    assert.ok(head.includes('김대표') && head.includes('김운행') && head.includes('12가3456'), head)
    const day = Number(today.slice(8))
    const tables = [...view.container.querySelectorAll('.doc-sheet-table')]
    assert.equal(tables.length, 3)
    const headDays = [...tables[0].querySelectorAll('thead th')].slice(1).map((th) => Number(th.textContent))
    const col = headDays.indexOf(day) + 1
    assert.ok(col > 0, '오늘이 든 구간이 처음 보임')
    const tireRow = [...tables[1].querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes('타이어'))
    assert.equal(tireRow?.children[col]?.textContent, 'X')
    const plateRow = tables[0].querySelector('tbody tr')
    assert.equal(plateRow?.children[col]?.textContent, 'O')

    const reportTab = [...view.container.querySelectorAll('.doc-tab')].find((el) => el.textContent === '운송비 내역서')
    assert.ok(reportTab instanceof window.HTMLButtonElement)
    await act(async () => { reportTab.click() })
    assert.ok(view.container.querySelector('#reportContentToExport'))
    assert.ok(view.container.querySelector('.doc-tabs'), '운송비 내역서 탭에도 탭 줄')
  } finally {
    await view.cleanup()
  }
})

test('휴무 날은 저장분이 있어도 미', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  const today = todayKey()
  commitWorkData(OWNER, { [today]: { isOff: true } }, { syncToCloud: false })
  monthRecords = { [today]: { items: allGoodItems(), actionNote: '', inspectorName: '기사' } }
  const view = await render()
  try {
    const table = view.container.querySelector('.doc-sheet-table')
    const days = [...(table?.querySelectorAll('thead th') || [])].slice(1).map((th) => Number(th.textContent))
    const col = days.indexOf(Number(today.slice(8))) + 1
    assert.equal(table?.querySelector('tbody tr')?.children[col]?.textContent, '미')
  } finally {
    await view.cleanup()
  }
})

test('연동 기사 앱처럼 메인 종류 차량이 없으면 첫 차량(배정 차량) 번호를 머리 칸에', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  commitCars(OWNER, [{ id: 'c-assigned', type: 'sub', number: '11가1111', supabaseId: 'veh-assigned' }], { syncToCloud: false })
  const view = await render()
  try {
    const head = view.container.querySelector('.doc-sheet-head')?.textContent || ''
    assert.ok(head.includes('11가1111'), head)
    assert.ok(head.includes('김운행'), '배정 차량 기사명이 비어 있으면 개인정보 성명')
  } finally {
    await view.cleanup()
  }
})

test('서류 탭 줄은 위 카드 안 달 이동 아래, 점검표 탭에서 옮긴 달을 운송비 내역서 탭도 그대로', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  const view = await render()
  try {
    const card = view.container.querySelector('.report-top-card')
    assert.ok(card?.querySelector('.maint-fuel-nav + .doc-tabs'), '달 이동 바로 아래 서류 탭 줄')
    const prev = new Date()
    prev.setDate(1)
    prev.setMonth(prev.getMonth() - 1)
    const prevLabel = `${prev.getFullYear()}년${prev.getMonth() + 1}월`
    const navText = () => (view.container.querySelector('.report-top-card .maint-fuel-nav')?.textContent || '').replace(/\s/g, '')
    const prevBtn = view.container.querySelector('.report-top-card button[title="이전 달"]')
    assert.ok(prevBtn instanceof window.HTMLButtonElement)
    await act(async () => { prevBtn.click() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.ok(navText().includes(prevLabel), navText())

    const reportTab = [...view.container.querySelectorAll('.doc-tab')].find((el) => el.textContent === '운송비 내역서')
    assert.ok(reportTab instanceof window.HTMLButtonElement)
    await act(async () => { reportTab.click() })
    assert.ok(view.container.querySelector('#reportContentToExport'))
    assert.ok(navText().includes(prevLabel), `운송비 내역서도 같은 달: ${navText()}`)
    assert.ok(view.container.querySelector('.report-top-card .maint-fuel-nav + .doc-tabs'), '운송비 내역서 탭도 카드 안')
  } finally {
    await view.cleanup()
  }
})

test('9-D 점검표 탭 아래 버튼 3개·안내 문구, 화면 밖 법정 서식 = 그 달 끝날까지 칸·○/×/미·점검자 이름·조치 기록', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  const today = todayKey()
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) - 1
  const lastDay = new Date(year, month + 1, 0).getDate()
  const firstKey = today.slice(0, 8) + '01'
  monthRecords = { [today]: { items: { ...allGoodItems(), tires: 'bad' }, actionNote: '타이어 교체', inspectorName: '김점검' } }
  if (firstKey !== today) monthRecords[firstKey] = { items: allGoodItems(), actionNote: '', inspectorName: '박점검' }
  const view = await render()
  try {
    const buttons = [...view.container.querySelectorAll('.doc-action-card button')]
    assert.deepEqual(buttons.map((el) => el.textContent), ['PDF 다운로드', '이미지 저장', '공유'])
    assert.ok(buttons.every((el) => el instanceof window.HTMLButtonElement && !el.disabled), '읽은 뒤엔 버튼 풀림')
    assert.ok(view.container.querySelector('.doc-export-notice')?.textContent?.includes('법정 서식'))

    const form = view.container.querySelector('.legal-form-offscreen .legal-form')
    assert.ok(form, '화면 밖 서식')
    const dayHeads = [...form.querySelectorAll('.legal-form-table thead tr:nth-child(2) th')].map((th) => Number(th.textContent))
    assert.equal(dayHeads.length, lastDay)
    assert.ok(dayHeads.includes(21), '21일 포함')
    const day = Number(today.slice(8))
    const rows = [...form.querySelectorAll('.legal-form-table tbody tr')]
    const cellOf = (/** @type {Element|undefined} */ row) => [...(row?.querySelectorAll('td') || [])][day - 1]?.textContent
    assert.equal(cellOf(rows.find((tr) => tr.textContent?.includes('타이어'))), '×')
    assert.equal(cellOf(rows[0]), '○')
    assert.equal(cellOf(rows.find((tr) => tr.textContent?.includes('점검자 확인'))), '김점검')
    if (day < lastDay) assert.equal([...rows[0].querySelectorAll('td')][day]?.textContent, '', '앞날 빈칸')
    assert.ok(form.querySelector('.legal-form-notes')?.textContent?.includes(`${day}일 타이어 교체`))
    const head = form.querySelector('.legal-form-head')?.textContent || ''
    assert.ok(head.includes('김대표') && head.includes('12가3456') && head.includes('김운행'), head)
  } finally {
    await view.cleanup()
  }
})

test('9-D 그 달 점검표를 읽기 전이면 내보내기 버튼 잠김', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  pendingFetch = new Promise(() => {})
  const view = await render()
  try {
    const buttons = [...view.container.querySelectorAll('.doc-action-card button')]
    assert.equal(buttons.length, 3)
    assert.ok(buttons.every((el) => el instanceof window.HTMLButtonElement && el.disabled))
    assert.equal(view.container.querySelector('.legal-form-offscreen'), null)
  } finally {
    pendingFetch = null
    await view.cleanup()
  }
})

test('세금계산서 정리 ② 차주: 탭 [세금계산서][운송비 내역서][일상점검표], 처음 [세금계산서], 위 카드에 [작성 전][발급 완료]', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  const view = await render({ owner: true })
  try {
    assert.deepEqual([...view.container.querySelectorAll('.doc-tab')].map((el) => el.textContent), ['세금계산서', '운송비 내역서', '일상점검표'])
    assert.equal(view.container.querySelector('.doc-tab.active')?.textContent, '세금계산서')
    const scope = [...view.container.querySelectorAll('.report-top-card .doc-scope-tab')].map((el) => el.textContent?.replace(/\d+$/, '').trim())
    assert.deepEqual(scope, ['작성 전', '발급 완료'])
  } finally {
    await view.cleanup()
  }
})

test('세금계산서 정리 ② 연동 기사 본인 앱엔 세금계산서 탭 없음(스위치 꺼짐이면 탭 줄도 없음)', async () => {
  commitSettings(OWNER, normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  const on = await render()
  try {
    assert.deepEqual([...on.container.querySelectorAll('.doc-tab')].map((el) => el.textContent), ['운송비 내역서', '일상점검표'])
  } finally {
    await on.cleanup()
  }
  commitSettings(OWNER, normalizeSettings({}), { syncToCloud: false })
  const off = await render()
  try {
    assert.equal(!!off.container.querySelector('.doc-tabs'), false)
    assert.equal((off.container.textContent || '').includes('세금계산서'), false)
  } finally {
    await off.cleanup()
  }
})

test('세금계산서 정리 ② 차량별: 메인 서류 발급 = 메인 차량 계산서만, 기사차량 서류 발급 = 그 차량 것만(저장된 발급 완료분 포함)', async () => {
  commitSettings(OWNER, normalizeSettings({}), { syncToCloud: false })
  commitCars(OWNER, [
    { id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main' },
    { id: 'c-sub', type: 'sub', number: '22가2222', supabaseId: 'veh-sub' },
  ], { syncToCloud: false })
  const today = todayKey()
  const monthKey = today.slice(0, 7)
  commitWorkData(OWNER, { [today]: { callDetails: [{ client: '메인거래처', fare: '100000' }] } }, { syncToCloud: false })
  commitLogWorkData(OWNER, '22가2222', { [today]: { callDetails: [{ client: '기사거래처', fare: '50000' }] } })
  commitInvoices(OWNER, [
    { id: `sales|${monthKey}|옛발급__22가2222`, flow: 'sales', monthKey, status: 'issued', partyKey: '옛발급__22가2222', clientName: '옛발급', supplyAmount: 1000, taxAmount: 100 },
  ], { syncToCloud: false })
  const cardsText = (/** @type {Element} */ root) => [...root.querySelectorAll('.tax-invoice-entry-card')].map((el) => el.textContent || '').join('|')
  /** @param {Element} root */
  const issuedTab = (root) => [...root.querySelectorAll('.doc-scope-tab')].find((el) => (el.textContent || '').startsWith('발급 완료'))

  const main = await render({ owner: true })
  try {
    assert.ok(cardsText(main.container).includes('메인거래처'))
    assert.equal(cardsText(main.container).includes('기사거래처'), false)
    const tab = issuedTab(main.container)
    assert.ok(tab instanceof window.HTMLButtonElement)
    await act(async () => { tab.click() })
    assert.equal(cardsText(main.container).includes('옛발급'), false, '다른 차량 발급 완료분 안 나옴')
  } finally {
    await main.cleanup()
  }

  const sub = await render({ owner: true, path: '/logs/22가2222/report' })
  try {
    assert.ok(cardsText(sub.container).includes('기사거래처'))
    assert.equal(cardsText(sub.container).includes('메인거래처'), false)
    const tab = issuedTab(sub.container)
    assert.ok(tab instanceof window.HTMLButtonElement)
    await act(async () => { tab.click() })
    assert.ok(cardsText(sub.container).includes('옛발급'), '그 차량 발급 완료분은 나옴')
  } finally {
    await sub.cleanup()
  }
})
