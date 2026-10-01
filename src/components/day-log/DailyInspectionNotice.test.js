// 로드맵 9-B-2 — 일지 안내 줄 + 점검표 모달: 보이는 조건, 작성 전·후 문구, 입력(모두 양호·전부 선택해야 저장)→저장→완료, 보기→연필→수정·취소, 바깥 클릭 규칙.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

/** @type {import('../../lib/dailyInspections.js').DailyInspection|null} */
let serverRecord = null
let failFetch = false
/** @type {Array<Record<string, unknown>>} */
let saved = []
mock.module('../../lib/dailyInspections.js', {
  namedExports: {
    fetchDailyInspection: async () => { if (failFetch) throw new Error('down'); return serverRecord },
    saveDailyInspection: async (/** @type {Record<string, unknown>} */ input) => { saved.push(input) },
  },
})

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: DailyInspectionNotice } = await import('./DailyInspectionNotice.jsx')
const { commitCars, commitProfile } = await import('../../store/commitHelpers.js')
const { EMPTY_PROFILE } = await import('../../lib/profile.js')
const { allGoodItems } = await import('../../domain/dailyInspectionItems.js')

const OWNER = 'di-notice-owner'

beforeEach(() => {
  serverRecord = null
  failFetch = false
  saved = []
  commitCars(OWNER, [
    { id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main' },
    { id: 'c-sub', type: 'sub', number: '77사7777', supabaseId: 'veh-sub', driverName: '박기사' },
  ], { syncToCloud: false })
  commitProfile(OWNER, { ...EMPTY_PROFILE, name: '차주이름' }, { syncToCloud: false })
})

/** @param {Partial<{ ownerKey: string, logId: string, enabled: boolean, isOff: boolean }>} [props] */
async function render(props = {}) {
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const element = React.createElement(DailyInspectionNotice, {
    ownerKey: OWNER, logId: 'main', dateKey: '2026-10-01', month: 10, day: 1, enabled: true, isOff: false,
    showToast: (/** @type {string} */ m) => { toasts.push(m) }, ...props,
  })
  await act(async () => { root.render(element) })
  /** @param {string} label */
  const click = async (label) => {
    const button = [...document.body.querySelectorAll('button')].find((el) => el.textContent?.trim() === label || el.getAttribute('aria-label') === label)
    assert.ok(button instanceof window.HTMLButtonElement, `${label} 버튼이 있어야 한다`)
    await act(async () => { button.click() })
  }
  const text = () => document.body.textContent || ''
  return { container, toasts, click, text, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('꺼짐·휴무·비회원이면 안내 줄 없음', async () => {
  for (const props of [{ enabled: false }, { isOff: true }, { ownerKey: 'guest' }]) {
    const view = await render(props)
    try {
      assert.equal(view.container.querySelector('.daily-inspection-notice'), null, JSON.stringify(props))
    } finally {
      await view.cleanup()
    }
  }
})

test('작성 전 [+ 입력] → 빈 칸이면 저장 안 됨 → [모두 양호] → 저장 → "작성 완료 [보기]"', async () => {
  const view = await render()
  try {
    assert.ok(view.text().includes('일상점검표 작성이 필요합니다.'))
    await view.click('+ 입력')
    assert.ok(view.text().includes('10월 1일 일상점검표'))
    assert.ok(view.text().includes('점검자: 차주이름 (자동 서명)'), '메인 차량(기사명 없음) = 로그인한 사람 이름')
    await view.click('저장')
    assert.deepEqual(view.toasts, ['모든 항목을 선택해 주세요.'])
    assert.equal(saved.length, 0)
    await view.click('모두 양호')
    await view.click('저장')
    assert.equal(saved.length, 1)
    assert.deepEqual(saved[0].items, allGoodItems())
    assert.equal(saved[0].vehicleId, 'veh-main')
    assert.equal(saved[0].workDate, '2026-10-01')
    assert.equal(saved[0].inspectorName, '차주이름')
    assert.equal(view.container.ownerDocument.querySelector('.daily-inspection-modal'), null, '저장 후 창 닫힘')
    assert.ok(view.text().includes('10월 1일 일상점검표 작성이 완료 되었습니다.'))
  } finally {
    await view.cleanup()
  }
})

test('기사차량: 점검자 이름 = 그 차량 기사명', async () => {
  const view = await render({ logId: '77사7777' })
  try {
    await view.click('+ 입력')
    assert.ok(view.text().includes('점검자: 박기사 (자동 서명)'))
    await view.click('모두 양호')
    await view.click('저장')
    assert.equal(saved[0].inspectorName, '박기사')
    assert.equal(saved[0].vehicleId, 'veh-sub')
  } finally {
    await view.cleanup()
  }
})

test('작성 후 [보기] → 읽기 전용(배지·조치 기록) → 연필 → 불량 바꾸고 [취소] → 보기로 돌아감(저장 안 함)', async () => {
  serverRecord = { items: { ...allGoodItems(), tires: 'bad' }, actionNote: '타이어 교체 예정', inspectorName: '김기사' }
  const view = await render()
  try {
    await view.click('보기')
    const modal = document.body.querySelector('.daily-inspection-modal')
    assert.ok(modal)
    assert.equal(modal.querySelectorAll('.di-result.bad').length, 1)
    assert.ok(view.text().includes('타이어 교체 예정'))
    assert.ok(view.text().includes('점검자: 김기사 (자동 서명)'))
    assert.equal(document.body.querySelector('.di-choice'), null, '보기 모드엔 선택 버튼 없음')
    await view.click('수정')
    assert.ok(document.body.querySelector('.di-choice.bad.is-selected'), '저장값이 채워진 입력')
    await view.click('취소')
    assert.ok(document.body.querySelector('.daily-inspection-modal'), '창은 그대로')
    assert.equal(document.body.querySelector('.di-choice'), null, '보기 모드로 돌아감')
    assert.equal(saved.length, 0)
  } finally {
    await view.cleanup()
  }
})

test('바깥 클릭: 입력 모드는 안 닫힘, 보기 모드는 닫힘', async () => {
  serverRecord = { items: allGoodItems(), actionNote: '', inspectorName: '김기사' }
  const view = await render()
  try {
    await view.click('보기')
    await view.click('수정')
    const overlay = document.body.querySelector('.modal-overlay')
    assert.ok(overlay instanceof window.HTMLElement)
    await act(async () => { overlay.click() })
    assert.ok(document.body.querySelector('.daily-inspection-modal'), '입력 모드는 바깥 클릭으로 안 닫힘')
    await view.click('취소')
    const overlay2 = document.body.querySelector('.modal-overlay')
    assert.ok(overlay2 instanceof window.HTMLElement)
    await act(async () => { overlay2.click() })
    assert.equal(document.body.querySelector('.daily-inspection-modal'), null, '보기 모드는 바깥 클릭으로 닫힘')
  } finally {
    await view.cleanup()
  }
})

test('불러오기 실패 → "불러오지 못했습니다 [다시 시도]" → 다시 시도하면 정상', async () => {
  failFetch = true
  const view = await render()
  try {
    assert.ok(view.text().includes('일상점검표를 불러오지 못했습니다.'))
    failFetch = false
    await view.click('다시 시도')
    assert.ok(view.text().includes('일상점검표 작성이 필요합니다.'))
  } finally {
    await view.cleanup()
  }
})
