// 재감사 8차(FAIL 지적 4번) — "sync 예약 0회"를 hasDirty() 전후 비교 같은 간접
// 신호로 증명하지 않는다. scheduleCloudSync() 자체를 이 파일 전용으로 mock.module
// 격리해서 실제 호출 횟수를 직접 센다. app-store.js가 정적으로
// `import { scheduleCloudSync } from '../lib/syncQueue.js'`를 부르므로, mock.module을
// 반드시 다른 어떤 import보다도 먼저 등록해야 한다(ESM은 최상위 정적 import를 전부
// 링크한 뒤에야 각 모듈 본문을 실행해서, 나중에 등록하면 이미 실제 모듈이 링크돼
// 스텁이 안 먹는다 — app-store.test.js/syncQueue.test.js와 같은 이유로 이 파일을
// pendingWorkDataWrites.test.js와 분리했다). 프로덕션 코드에는 테스트 전용 우회를
// 넣지 않았다 — 오직 이 테스트 파일의 mock.module 등록만으로 격리한다.
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

let scheduleCloudSyncCallCount = 0
mock.module('./syncQueue.js', {
  exports: {
    scheduleCloudSync: () => { scheduleCloudSyncCallCount += 1 },
    flushCloudSync: async () => {},
  },
})

const { registerPendingDayWrite, retryPendingDayWrites, pendingDayWriteCount } = await import('./pendingWorkDataWrites.js')
const { isDurableWriteBroken } = await import('./durableWriteGuard.js')
const { getState, subscribe } = await import('../store/app-store.js')
const { commitWorkData } = await import('../store/commitHelpers.js')
const { readJsonKey } = await import('../store/persist.js')

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @param {string} ownerKey @param {string} dateKey */
function committedFixedCount(ownerKey, dateKey) {
  const main = getState().workLogs[ownerKey]?.main
  return main ? (/** @type {Record<string, { fixedCount?: number|string }>} */ (main))[dateKey]?.fixedCount : undefined
}

/** @returns {number} */
function totalStubSupabaseCalls() {
  return Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0)
}

/** @param {string} ownerKey @returns {Record<string, DayRecordLike>} */
function readWorkData(ownerKey) {
  return readJsonKey('workData', ownerKey, /** @type {Record<string, DayRecordLike>} */ ({}))
}

// 양성 대조군 — spy 자체가 실제로 살아 있는지부터 확인한다(정상 커밋은 반드시
// scheduleCloudSync를 부른다는 걸 먼저 보여야, 아래 "0회" 주장들이 "애초에 spy가
// 죽어서 항상 0"이 아니라는 근거가 된다).
test('재감사 8차 FAIL 지적 4번 — 양성 대조군: 정상 retry는 scheduleCloudSync를 정확히 1회 부른다', () => {
  const ownerKey = 'pw-syncspy-positive'
  const dateKey = '2026-09-10'
  const before = scheduleCloudSyncCallCount
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 3, palletCount: 0, callDetails: [], fixedRouteCounts: {} })

  retryPendingDayWrites()

  assert.equal(committedFixedCount(ownerKey, dateKey), 3, '정상 케이스는 실제로 커밋돼야 한다(spy가 살아 있다는 대조군)')
  assert.equal(scheduleCloudSyncCallCount, before + 1, '정상 커밋은 scheduleCloudSync를 정확히 1회 불러야 한다')
})

test('재감사 8차 FAIL 지적 4번 — 불완전 patch(P0) 스키마 위반으로 인한 retry 스킵은 scheduleCloudSync를 0회 부른다', () => {
  const ownerKey = 'pw-syncspy-incomplete-patch'
  const dateKey = '2026-09-11'
  const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }, { syncToCloud: false })
  localStorage.setItem(durKey, JSON.stringify({ [dateKey]: { isOff: false } }))

  const before = scheduleCloudSyncCallCount
  resetStubSupabaseCallCounts()
  retryPendingDayWrites()

  assert.equal(committedFixedCount(ownerKey, dateKey), 5, '기존 일지가 지워지면 안 된다')
  assert.equal(scheduleCloudSyncCallCount, before, '스키마 위반 patch는 scheduleCloudSync를 전혀 부르면 안 된다')
  assert.equal(totalStubSupabaseCalls(), 0, '원격 호출도 0회여야 한다')
})

test('재감사 8차 FAIL 지적 4번 — 손상된 owner + 최신 fallback 공존 시 retry 스킵은 scheduleCloudSync를 0회 부른다', () => {
  const ownerKey = 'pw-syncspy-corrupt-owner'
  const dateKey = '2026-09-12'
  const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} } }, { syncToCloud: false })
  localStorage.setItem(durKey, JSON.stringify({ [dateKey]: [] }))
  registerPendingDayWrite(ownerKey, dateKey, { isOff: false, fixedCount: 9, palletCount: 2, callDetails: [], fixedRouteCounts: {} })

  const before = scheduleCloudSyncCallCount
  resetStubSupabaseCallCounts()
  retryPendingDayWrites()

  assert.equal(committedFixedCount(ownerKey, dateKey), 5, '손상된 owner의 fallback을 건너뛰었으니 기존 일지가 그대로여야 한다')
  assert.equal(scheduleCloudSyncCallCount, before, '손상된 owner를 건너뛰었으니 scheduleCloudSync가 불리면 안 된다')
  assert.equal(totalStubSupabaseCalls(), 0, '원격 호출도 0회여야 한다')
})

// 재감사 9차(FAIL 지적 1번, P0) — EffectivePatch의 fixedCount/palletCount/
// fixedRouteCounts 값은 day-log-reducer.js의 실제 DayDraft 계약대로 0 이상의
// 유한한 정수여야 한다. typeof number만 보던 예전 검증은 문자열·음수·소수를 전부
// 놓쳤다 — 사용자가 지정한 7가지 경우를 전부 확인한다.
const NUMERIC_VIOLATION_CASES = [
  {
    label: '기존 fixedCount:5 + fixedCount:"oops"',
    seed: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
    patch: { isOff: false, fixedCount: 'oops', palletCount: 0, callDetails: [], fixedRouteCounts: {} },
  },
  {
    label: '기존 fixedCount:5 + fixedCount:-1',
    seed: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
    patch: { isOff: false, fixedCount: -1, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
  },
  {
    label: '기존 fixedCount:5 + fixedCount:1.5',
    seed: { isOff: false, fixedCount: 5, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
    patch: { isOff: false, fixedCount: 1.5, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
  },
  {
    label: '기존 palletCount:4 + palletCount:"oops"',
    seed: { isOff: false, fixedCount: 0, palletCount: 4, callDetails: [], fixedRouteCounts: {} },
    patch: { isOff: false, fixedCount: 0, palletCount: 'oops', callDetails: [], fixedRouteCounts: {} },
  },
  {
    label: '기존 palletCount:4 + palletCount:-1',
    seed: { isOff: false, fixedCount: 0, palletCount: 4, callDetails: [], fixedRouteCounts: {} },
    patch: { isOff: false, fixedCount: 0, palletCount: -1, callDetails: [], fixedRouteCounts: {} },
  },
  {
    label: '기존 fixedRouteCounts:{r1:2} + {r1:-1}',
    seed: { isOff: false, fixedCount: 0, palletCount: 0, callDetails: [], fixedRouteCounts: { r1: 2 } },
    patch: { isOff: false, fixedCount: 0, palletCount: 0, callDetails: [], fixedRouteCounts: { r1: -1 } },
  },
  {
    label: '기존 fixedRouteCounts:{r1:2} + {r1:1.5}',
    seed: { isOff: false, fixedCount: 0, palletCount: 0, callDetails: [], fixedRouteCounts: { r1: 2 } },
    patch: { isOff: false, fixedCount: 0, palletCount: 0, callDetails: [], fixedRouteCounts: { r1: 1.5 } },
  },
]

NUMERIC_VIOLATION_CASES.forEach(({ label, seed, patch }, index) => {
  test(`재감사 9차 FAIL 지적 1번(P0) — ${label}은 정상 pending으로 통과하지 않는다`, () => {
    const ownerKey = `pw-syncspy-numeric-${index}`
    const dateKey = '2026-09-13'
    const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`
    commitWorkData(ownerKey, { [dateKey]: seed }, { syncToCloud: false })
    localStorage.setItem(durKey, JSON.stringify({ [dateKey]: patch }))

    const storeBefore = JSON.stringify(getState().workLogs[ownerKey])
    const localBefore = JSON.stringify(readWorkData(ownerKey))
    const durableBefore = localStorage.getItem(durKey)
    const tombstoneBefore = JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, []))
    const scheduleCloudSyncBefore = scheduleCloudSyncCallCount
    resetStubSupabaseCallCounts()
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })

    retryPendingDayWrites()
    unsubscribe()

    assert.equal(JSON.stringify(getState().workLogs[ownerKey]), storeBefore, `[${label}] Store가 그대로 유지돼야 한다`)
    assert.equal(JSON.stringify(readWorkData(ownerKey)), localBefore, `[${label}] localStorage도 그대로 유지돼야 한다`)
    assert.equal(localStorage.getItem(durKey), durableBefore, `[${label}] durable 원문이 바이트 단위로 그대로 유지돼야 한다`)
    assert.equal(JSON.stringify(readJsonKey('workDataDeletedDates', ownerKey, [])), tombstoneBefore, `[${label}] tombstone이 변하면 안 된다`)
    assert.equal(notifyCount, 0, `[${label}] Store notify가 0회여야 한다`)
    assert.equal(scheduleCloudSyncCallCount, scheduleCloudSyncBefore, `[${label}] scheduleCloudSync가 불리면 안 된다`)
    assert.equal(totalStubSupabaseCalls(), 0, `[${label}] 원격 호출이 0회여야 한다`)
    assert.equal(isDurableWriteBroken(), true, `[${label}] 숫자 계약 위반은 읽기 실패로 취급돼 broken이어야 한다`)
  })
})

// 재감사 9차(FAIL 지적 2번) — callDetails:[{}](id 없음)도 정상 pending으로 통과하면
// 안 된다. 기존 fixedCount/palletCount/fixedRouteCounts가 있는 상태에서 이 값이
// 주입되면 그 값들이 전혀 변하지 않아야 한다(사용자 지정 회귀 시나리오).
test('재감사 9차 FAIL 지적 2번 — callDetails:[{}](id 없음) 주입은 기존 fixedCount/palletCount/fixedRouteCounts를 전혀 바꾸지 않는다', () => {
  const ownerKey = 'pw-syncspy-calldetail-noId'
  const dateKey = '2026-09-14'
  const durKey = `reactPracticeDurablePendingWrites:${ownerKey}`
  const seed = { isOff: false, fixedCount: 3, palletCount: 2, callDetails: [], fixedRouteCounts: { r1: 7 } }
  commitWorkData(ownerKey, { [dateKey]: seed }, { syncToCloud: false })
  localStorage.setItem(durKey, JSON.stringify({
    [dateKey]: { isOff: false, fixedCount: 9, palletCount: 9, callDetails: [{}], fixedRouteCounts: { r1: 9 } },
  }))

  const storeBefore = JSON.stringify(getState().workLogs[ownerKey])
  const scheduleCloudSyncBefore = scheduleCloudSyncCallCount
  resetStubSupabaseCallCounts()

  retryPendingDayWrites()

  assert.equal(JSON.stringify(getState().workLogs[ownerKey]), storeBefore, 'Store가 그대로 유지돼야 한다')
  assert.equal(committedFixedCount(ownerKey, dateKey), 3, 'fixedCount가 그대로여야 한다')
  assert.equal(scheduleCloudSyncCallCount, scheduleCloudSyncBefore, 'scheduleCloudSync가 불리면 안 된다')
  assert.equal(totalStubSupabaseCalls(), 0, '원격 호출이 0회여야 한다')
  assert.equal(isDurableWriteBroken(), true, 'id 없는 콜상세는 읽기 실패로 취급돼 broken이어야 한다')
  assert.equal(pendingDayWriteCount() > 0, true, '거짓으로 "pending 없음"이 되면 안 된다')
})
