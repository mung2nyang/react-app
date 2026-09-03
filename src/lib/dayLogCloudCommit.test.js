// 슬라이스 D — 로그인 메인 일지의 클라우드 Fail-Fast 저장(commitMainDayLogToCloud)을
// UI가 타는 실제 코드 경로(useDayDraft.commitNow가 부르는 함수)로 직접 검증한다.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
const { mock } = await import('node:test')
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { commitMainDayLogToCloud } = await import('./dayLogCloudCommit.js')
const { shouldCommitDayLogToCloud } = await import('./mainDayLogRouting.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { setHydration, getState } = await import('../store/app-store.js')
const { commitCars, commitWorkData } = await import('../store/commitHelpers.js')
const { readJsonKey } = await import('../store/persist.js')

const FAIL_FAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const DK = '2026-10-10'

/** @param {string} userId @param {string} ownerKey @param {boolean} [ready] */
function beginLoggedIn(userId, ownerKey, ready = true) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.daily_logs = { upsert: () => ({ data: { id: 5001 }, error: null }) }
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: ready ? 'ready' : 'failed', userId, ownerKey })
  commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 700 }], { syncToCloud: false })
}

/** @param {string} ownerKey @param {import('../domain/dayRecordTypes.js').DayRecordLike} record */
function withDay(ownerKey, record) {
  commitWorkData(ownerKey, { [DK]: record }, { syncToCloud: false })
}

describe('commitMainDayLogToCloud — 슬라이스 D Fail-Fast', () => {
  test('게스트(세션 없음)면 { cloud: false } — 호출부가 로컬 경로를 탄다', async () => {
    endCloudSession()
    const r = await commitMainDayLogToCloud({ ownerKey: 'guest', logId: 'main', dateKey: DK, previousData: {}, nextData: { [DK]: { fixedCount: 1 } } })
    assert.deepEqual(r, { cloud: false })
  })

  test('서버에 없는 서브 차량 번호면 { cloud: false }', async () => {
    beginLoggedIn('u1', 'dlc-sub')
    const r = await commitMainDayLogToCloud({ ownerKey: 'dlc-sub', logId: '11가1111', dateKey: DK, previousData: {}, nextData: { [DK]: { fixedCount: 1 } } })
    assert.deepEqual(r, { cloud: false })
    endCloudSession()
  })

  test('로그인+supabaseId 있는 서브 차량: Fail-Fast로 서버 저장 후 logId Store 반영', async () => {
    beginLoggedIn('u1', 'dlc-sub-ok')
    commitCars('dlc-sub-ok', [
      { id: 'car-main', type: 'main', number: '12가3456', supabaseId: 700 },
      { id: 'car-sub', type: 'sub', number: '11가1111', supabaseId: 801, driverName: '김기사', driverPhone: '01012345678' },
    ], { syncToCloud: false })
    withDay('dlc-sub-ok', { fixedCount: 1, callDetails: [] })

    const r = await commitMainDayLogToCloud({
      ownerKey: 'dlc-sub-ok', logId: '11가1111', dateKey: DK,
      previousData: {}, nextData: { [DK]: { fixedCount: 5, callDetails: [] } },
    })

    assert.deepEqual(r, { cloud: true, ok: true, toast: null })
    assert.equal(countOf('daily_logs', 'upsert'), 1)
    assert.equal(getState().workLogs['dlc-sub-ok']?.['11가1111']?.[DK]?.fixedCount, 5)
    assert.equal(getState().workLogs['dlc-sub-ok']?.main?.[DK]?.fixedCount, 1, '메인 일지는 건드리면 안 된다')
    endCloudSession()
  })

  test('서버에 없는 메인 차량이면 { cloud: false }', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    beginSessionEpoch('u1', 'dlc-nocar')
    setHydration({ status: 'ready', userId: 'u1', ownerKey: 'dlc-nocar' })
    commitCars('dlc-nocar', [{ id: 'c', type: 'main', number: '9' }], { syncToCloud: false })
    const r = await commitMainDayLogToCloud({ ownerKey: 'dlc-nocar', logId: 'main', dateKey: DK, previousData: {}, nextData: { [DK]: { fixedCount: 1 } } })
    assert.deepEqual(r, { cloud: false })
    assert.equal(shouldCommitDayLogToCloud('dlc-nocar', 'main'), false)
    endCloudSession()
  })

  test('hydration failed: Fail-Fast 토스트, 서버 0회, Store 미변경', async () => {
    beginLoggedIn('u1', 'dlc-failed', false)
    withDay('dlc-failed', { fixedCount: 2, callDetails: [] })

    const r = await commitMainDayLogToCloud({ ownerKey: 'dlc-failed', logId: 'main', dateKey: DK, previousData: {}, nextData: { [DK]: { fixedCount: 7, callDetails: [] } } })

    assert.deepEqual(r, { cloud: true, ok: false, toast: FAIL_FAST })
    assert.equal(countOf('daily_logs', 'upsert'), 0)
    assert.equal(getState().workLogs['dlc-failed']?.main?.[DK]?.fixedCount, 2, 'Store는 저장 전 값(2)이어야 한다')
    endCloudSession()
  })

  test('ready + upsert throw: Fail-Fast 토스트, Store 저장 전 값', async () => {
    beginLoggedIn('u1', 'dlc-throw')
    handlers.daily_logs = { upsert: () => { throw new Error('network down') } }
    withDay('dlc-throw', { fixedCount: 2, callDetails: [] })

    const r = await commitMainDayLogToCloud({ ownerKey: 'dlc-throw', logId: 'main', dateKey: DK, previousData: { [DK]: { fixedCount: 2 } }, nextData: { [DK]: { fixedCount: 7, callDetails: [] } } })

    assert.deepEqual(r, { cloud: true, ok: false, toast: FAIL_FAST })
    assert.equal(countOf('daily_logs', 'upsert'), 1)
    assert.equal(getState().workLogs['dlc-throw']?.main?.[DK]?.fixedCount, 2)
    endCloudSession()
  })

  test('ready + { data: null, error }: Fail-Fast 토스트', async () => {
    beginLoggedIn('u1', 'dlc-dataerr')
    handlers.daily_logs = { upsert: () => ({ data: null, error: { message: 'RLS' } }) }
    withDay('dlc-dataerr', { fixedCount: 2, callDetails: [] })

    const r = await commitMainDayLogToCloud({ ownerKey: 'dlc-dataerr', logId: 'main', dateKey: DK, previousData: { [DK]: { fixedCount: 2 } }, nextData: { [DK]: { fixedCount: 7, callDetails: [] } } })

    assert.deepEqual(r, { cloud: true, ok: false, toast: FAIL_FAST })
    assert.equal(getState().workLogs['dlc-dataerr']?.main?.[DK]?.fixedCount, 2)
    endCloudSession()
  })

  test('성공: 그 날짜 daily_logs upsert 1회, Store 반영, 전체맵 재sync 없음', async () => {
    beginLoggedIn('u1', 'dlc-ok')
    withDay('dlc-ok', { fixedCount: 2, callDetails: [] })
    const next = { [DK]: { fixedCount: 9, callDetails: [] }, '2026-10-11': { fixedCount: 1, callDetails: [] } }

    const r = await commitMainDayLogToCloud({ ownerKey: 'dlc-ok', logId: 'main', dateKey: DK, previousData: { [DK]: { fixedCount: 2 } }, nextData: next })

    assert.deepEqual(r, { cloud: true, ok: true, toast: null })
    assert.equal(countOf('daily_logs', 'upsert'), 1, '그 날짜 1회만')
    assert.equal(getState().workLogs['dlc-ok']?.main?.[DK]?.fixedCount, 9)
    endCloudSession()
  })

  test('빈 날 삭제: 서버 delete 후 Store에서 그 dateKey 제거, 새 tombstone 없음', async () => {
    beginLoggedIn('u1', 'dlc-del')
    withDay('dlc-del', { fixedCount: 2, callDetails: [] })

    const r = await commitMainDayLogToCloud({ ownerKey: 'dlc-del', logId: 'main', dateKey: DK, previousData: { [DK]: { fixedCount: 2 } }, nextData: {} })

    assert.deepEqual(r, { cloud: true, ok: true, toast: null })
    assert.equal(countOf('daily_logs', 'delete'), 1)
    assert.equal(countOf('daily_logs', 'upsert'), 0)
    assert.equal(getState().workLogs['dlc-del']?.main?.[DK], undefined, 'Store에서 그 dateKey가 빠져야 한다')
    assert.deepEqual(readJsonKey('workDataDeletedDates', 'dlc-del', {}), {}, '새 tombstone을 만들면 안 된다')
    endCloudSession()
  })

  test('세션 전환: upsert await 이후 로그아웃하면 Store 미반영', async () => {
    beginLoggedIn('u1', 'dlc-epoch')
    withDay('dlc-epoch', { fixedCount: 2, callDetails: [] })
    /** @type {() => void} */ let releaseUpsert = () => {}
    const gate = /** @type {Promise<void>} */ (new Promise((resolve) => { releaseUpsert = resolve }))
    handlers.daily_logs = { upsert: () => gate.then(() => ({ data: { id: 5001 }, error: null })) }

    const promise = commitMainDayLogToCloud({ ownerKey: 'dlc-epoch', logId: 'main', dateKey: DK, previousData: { [DK]: { fixedCount: 2 } }, nextData: { [DK]: { fixedCount: 9, callDetails: [] } } })
    endCloudSession() // await 대기 중 로그아웃
    releaseUpsert()
    const r = await promise

    assert.equal(r.cloud, true)
    assert.equal(r.ok, false)
    assert.equal(getState().workLogs['dlc-epoch']?.main?.[DK]?.fixedCount, 2, 'Store는 저장 전 값(2)이어야 한다')
  })
})
