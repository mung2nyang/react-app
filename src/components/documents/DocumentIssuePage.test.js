// 로드맵 9-C-1 — 서류 발급: 탭 보임/숨김(스위치·저장분), 처음 탭 [일상점검표], 표 칸(O/X/미/빈칸)·머리 칸, [운송비 내역서] 탭은 기존 화면.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

let hasAny = false
/** @type {Record<string, Record<string, 'good'|'bad'>>} */
let monthRecords = {}
mock.module('../../lib/dailyInspections.js', {
  namedExports: {
    hasAnyDailyInspection: async () => hasAny,
    fetchMonthDailyInspections: async () => monthRecords,
  },
})

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Route, Routes } = await import('react-router-dom')
const { act } = React
const { default: DocumentIssuePage } = await import('./DocumentIssuePage.jsx')
const { commitCars, commitProfile, commitSettings, commitWorkData } = await import('../../store/commitHelpers.js')
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
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/report'] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/report', element: React.createElement(DocumentIssuePage, { ownerKey: OWNER, onBack: () => {} }) }))))
  })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  return { container, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('스위치 꺼짐 + 저장분 없음 → 탭 줄 없이 운송비 내역서만, 제목 "서류 발급"', async () => {
  commitSettings(OWNER, normalizeSettings({}), { syncToCloud: false })
  const view = await render()
  try {
    assert.equal(view.container.querySelector('.doc-tabs'), null)
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
  monthRecords = { [today]: { ...allGoodItems(), tires: 'bad' } }
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
  monthRecords = { [today]: allGoodItems() }
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
