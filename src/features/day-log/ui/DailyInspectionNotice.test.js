// 로드맵 9-B-2 — 일지 안내 줄 + 점검표 모달: 보이는 조건, 작성 전·후 문구, 입력(모두 양호·전부 선택해야 저장)→저장→완료, 보기→연필→수정·취소, 바깥 클릭 규칙.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

/** @type {import('../../../data/sync/dailyInspections.ts').DailyInspection|null} */
let serverRecord = null
let failFetch = false
/** @type {Promise<null>|null} */
let holdFetch = null
/** @type {Array<Record<string, unknown>>} */
let saved = []
/** @type {Array<{ vehicleId: string|number, workDate: string }>} */
let deleted = []
/** @type {Error|null} */
let deleteError = null
/** @type {Promise<null>|null} */
let holdDelete = null
mock.module('../../../data/sync/dailyInspections.ts', {
  namedExports: {
    fetchDailyInspection: async () => { if (holdFetch) return holdFetch; if (failFetch) throw new Error('down'); return serverRecord },
    saveDailyInspection: async (/** @type {Record<string, unknown>} */ input) => { saved.push(input) },
    deleteDailyInspection: async (/** @type {{ vehicleId: string|number, workDate: string }} */ input) => { if (holdDelete) await holdDelete; if (deleteError) throw deleteError; deleted.push(input) },
  },
})

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: DailyInspectionNotice } = await import('./DailyInspectionNotice.jsx')
const { commitCars, commitProfile } = await import('../../../data/store/commitHelpers.ts')
const { EMPTY_PROFILE } = await import('../../../data/sync/profileSave.ts')
const { allGoodItems } = await import('../../../domain/dailyInspectionItems.ts')
const { SERVER_SAVE_FAIL } = await import('../../../shared/utils/failureMessages.js')

const OWNER = 'di-notice-owner'

beforeEach(() => {
  serverRecord = null
  failFetch = false
  holdFetch = null
  saved = []
  deleted = []
  deleteError = null
  holdDelete = null
  commitCars(OWNER, [
    { id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main' },
    { id: 'c-sub', type: 'sub', number: '77사7777', supabaseId: 'veh-sub', driverName: '박기사' },
  ])
  commitProfile(OWNER, { ...EMPTY_PROFILE, name: '차주이름' })
})

/** @param {Partial<{ ownerKey: string, logId: string, enabled: boolean, isOff: boolean }>} [props] */
async function render(props = {}) {
  const { ownerKey = OWNER, ...rest } = props
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const element = withSession(React.createElement(DailyInspectionNotice, { logId: 'main', dateKey: '2026-10-01', month: 10, day: 1, enabled: true, isOff: false,
    ...rest,
  }), { ownerKey })
  await act(async () => { root.render(withToast(element, (/** @type {string} */ m) => { toasts.push(m) })) })
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

test('서버 확인 중엔 같은 상자에 글자·버튼 자리 막대(로드맵 15번), 버튼 없음, 읽기용 "불러오는 중"', async () => {
  holdFetch = new Promise(() => {})
  const view = await render()
  try {
    const box = view.container.querySelector('.daily-inspection-notice')
    assert.ok(box?.classList.contains('is-loading'))
    assert.equal(box?.getAttribute('aria-busy'), 'true')
    assert.equal(box?.querySelectorAll('.di-skeleton').length, 2, '글자 자리 + 버튼 자리 막대 두 개')
    assert.equal(box?.querySelectorAll('button').length, 0)
    assert.equal(box?.textContent, '일상점검표 불러오는 중')
  } finally {
    await view.cleanup()
  }
})

test('확인이 끝나면 막대가 사라지고 "작성이 필요합니다" + [+ 입력]', async () => {
  /** @type {(value: null) => void} */
  let release = () => {}
  holdFetch = new Promise((resolve) => { release = resolve })
  const view = await render()
  try {
    assert.equal(view.container.querySelectorAll('.di-skeleton').length, 2)
    await act(async () => { release(null) })
    assert.equal(view.container.querySelectorAll('.di-skeleton').length, 0)
    assert.ok(view.text().includes('일상점검표 작성이 필요합니다.'))
    assert.ok([...view.container.querySelectorAll('button')].some((el) => el.textContent === '+ 입력'))
  } finally {
    await view.cleanup()
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
    assert.ok(view.text().includes('10월 1일 일상점검표 작성이 완료되었습니다.'))
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

// 로드맵 112 — 지우기: 저장된 점검표를 수정에서 다 비우고 [저장] → 확인 창 → 지우기. 처음 입력은 지금처럼 막음.
/** @param {boolean} answer @param {Array<string>} asked */
function fakeConfirm(answer, asked) {
  const original = window.confirm
  window.confirm = (/** @type {string|undefined} */ message) => { asked.push(String(message)); return answer }
  return () => { window.confirm = original }
}

/** 저장된 점검표 보기 → 연필 → [모두 양호]를 다시 눌러 전부 해제. @param {Awaited<ReturnType<typeof render>>} view */
async function clearAll(view) {
  await view.click('보기')
  await view.click('수정')
  await view.click('모두 양호')
  assert.equal(document.body.querySelectorAll('.di-choice.is-selected').length, 0, '전부 해제')
}

test('다 비우고 [저장] → 확인 창 [취소]면 수정 화면에 그대로, [지우기]면 지우고 창 닫힘·알림·"작성이 필요합니다"', async () => {
  serverRecord = { items: allGoodItems(), actionNote: '', inspectorName: '김기사' }
  const view = await render()
  /** @type {Array<string>} */
  const asked = []
  let restore = fakeConfirm(false, asked)
  try {
    await clearAll(view)
    await view.click('저장')
    assert.deepEqual(asked, ['점검표를 지울까요?\n모든 항목이 비어 있어 10월 1일 점검표가 지워집니다. 되돌릴 수 없습니다.'])
    assert.deepEqual(deleted, [], '취소면 안 지움')
    assert.ok(document.body.querySelector('.di-choice'), '수정 화면 그대로')
    assert.deepEqual(view.toasts, [])
    restore()
    restore = fakeConfirm(true, asked)
    await view.click('저장')
    assert.deepEqual(deleted, [{ vehicleId: 'veh-main', workDate: '2026-10-01' }])
    assert.equal(saved.length, 0, '저장이 아니라 지우기')
    assert.equal(document.body.querySelector('.daily-inspection-modal'), null, '창 닫힘')
    assert.deepEqual(view.toasts, ['일상점검표를 지웠습니다.'])
    assert.ok(view.text().includes('일상점검표 작성이 필요합니다.'))
    await view.click('+ 입력')
    await view.click('모두 양호')
    await view.click('저장')
    assert.equal(saved.length, 1, '지운 날에 다시 저장')
  } finally {
    restore()
    await view.cleanup()
  }
})

test('지우기 실패(서버 오류·0줄)면 실패 알림, 수정 화면에 남고 안내 줄은 그대로', async () => {
  serverRecord = { items: allGoodItems(), actionNote: '', inspectorName: '김기사' }
  const view = await render()
  const restore = fakeConfirm(true, [])
  const errors = mock.method(console, 'error', () => {})
  try {
    await clearAll(view)
    deleteError = new Error('일상점검표를 지우지 못했습니다.')
    await view.click('저장')
    deleteError = new Error('')
    await view.click('저장')
    assert.deepEqual(view.toasts, ['일상점검표를 지우지 못했습니다.', SERVER_SAVE_FAIL])
    assert.ok(document.body.querySelector('.di-choice'), '수정 화면 그대로')
    await view.click('취소')
    await view.click('닫기')
    assert.ok(view.text().includes('10월 1일 일상점검표 작성이 완료되었습니다.'), '안내 줄 그대로')
  } finally {
    errors.mock.restore()
    restore()
    await view.cleanup()
  }
})

test('지우는 동안 [저장]이 잠기고 두 번 눌러도 한 번만 지운다', async () => {
  serverRecord = { items: allGoodItems(), actionNote: '', inspectorName: '김기사' }
  const view = await render()
  const restore = fakeConfirm(true, [])
  try {
    await clearAll(view)
    /** @type {() => void} */
    let release = () => {}
    holdDelete = new Promise((resolve) => { release = () => resolve(null) })
    const saveButton = /** @type {HTMLButtonElement} */ (document.body.querySelector('.modal-btn.confirm'))
    await act(async () => { saveButton.click(); saveButton.click() })
    assert.equal(saveButton.disabled, true, '지우는 중 잠금')
    await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.equal(deleted.length, 1)
  } finally {
    restore()
    await view.cleanup()
  }
})

test('처음 입력·일부만 고른 수정은 지금처럼 "모든 항목을 선택해 주세요."(지우지 않음), 조치 기록만 써도 항목이 다 비면 지우기', async () => {
  const asked = /** @type {Array<string>} */ ([])
  const restore = fakeConfirm(true, asked)
  let view = await render()
  try {
    await view.click('+ 입력')
    await view.click('저장')
    assert.deepEqual(view.toasts, ['모든 항목을 선택해 주세요.'])
    await view.cleanup()
    serverRecord = { items: allGoodItems(), actionNote: '', inspectorName: '김기사' }
    view = await render()
    await view.click('보기')
    await view.click('수정')
    const firstGood = /** @type {HTMLButtonElement} */ (document.body.querySelector('.di-choice.good.is-selected'))
    await act(async () => { firstGood.click() })
    await view.click('저장')
    assert.deepEqual(view.toasts, ['모든 항목을 선택해 주세요.'], '일부만 비면 막음')
    await view.click('모두 양호')
    await view.click('모두 양호')
    const note = /** @type {HTMLTextAreaElement} */ (document.body.querySelector('.di-note'))
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => { setter?.call(note, '메모만'); note.dispatchEvent(new window.Event('input', { bubbles: true })) })
    await view.click('저장')
    assert.equal(asked.length, 1, '항목이 다 비면 조치 기록이 있어도 지우기')
    assert.equal(deleted.length, 1)
    assert.equal(saved.length, 0)
  } finally {
    restore()
    await view.cleanup()
  }
})
