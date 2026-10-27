// 일지 저장이 겹쳐도 먼저 끝난 다른 날짜 저장이 화면(Store)에서 되돌아가지 않는다.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { commitMainDayLogToCloud, commitMainDayLogMapToCloud } = await import('./dayLogCloudCommit.ts')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration } = await import('../store/app-store.ts')
const { commitCars, commitWorkData } = await import('../store/commitHelpers.ts')
const { readOwnerLogWorkData } = await import('../store/ownerWorkDataHooks.ts')
const { saveDayRecord } = await import('../../domain/day-record.ts')

/** 날짜별로 서버 저장이 끝나는 시간(ms)을 정한 가짜 서버로 로그인 상태를 만든다. @param {string} ownerKey @param {Record<string, number>} delays */
function beginOwner(ownerKey, delays) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.rpc = {
    save_day_log: async (/** @type {{ p_log: { work_date: string } }} */ args) => {
      await wait(delays[args.p_log.work_date] ?? 5)
      return { data: 1, error: null }
    },
  }
  beginSessionEpoch(`${ownerKey}-user`, ownerKey)
  setHydration({ status: 'ready', userId: `${ownerKey}-user`, ownerKey })
  commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 700 }])
  commitWorkData(ownerKey, {})
}

/** 일지 화면 저장과 같은 순서: 저장 시작 때 그 차량 일지 전체를 읽고 그 날짜만 바꾼다. @param {string} ownerKey @param {string} dateKey @param {number} fixedCount */
function startSave(ownerKey, dateKey, fixedCount) {
  const latest = readOwnerLogWorkData(ownerKey, 'main')
  const next = saveDayRecord(latest, dateKey, { isOff: false, fixedCount, palletCount: 0, callDetails: [], fixedRouteCounts: {} })
  return commitMainDayLogToCloud({ ownerKey, logId: 'main', dateKey, previousData: latest, nextData: next })
}

test('A4: 다른 날짜 저장 두 개가 겹쳐도 둘 다 화면(Store)에 남는다', async () => {
  const ownerKey = 'a4-owner'
  beginOwner(ownerKey, { '2026-10-01': 40, '2026-10-02': 5 })
  const first = startSave(ownerKey, '2026-10-01', 3) // 먼저 시작, 늦게 끝남
  const second = startSave(ownerKey, '2026-10-02', 5) // 나중 시작, 먼저 끝남
  const results = await Promise.all([first, second])
  assert.deepEqual(results.map((r) => r.cloud && 'ok' in r && r.ok), [true, true], '둘 다 서버 저장 성공')
  const work = readOwnerLogWorkData(ownerKey, 'main')
  assert.equal(work['2026-10-01']?.fixedCount, 3, '10월 1일 저장분')
  assert.equal(work['2026-10-02']?.fixedCount, 5, `10월 2일 저장분이 사라짐: ${JSON.stringify(work['2026-10-02'])}`)
  endCloudSession()
})

test('A4: 여러 날짜 저장 중 먼저 끝난 다른 날짜 저장도 화면(Store)에 남는다', async () => {
  const ownerKey = 'a4-owner-map'
  beginOwner(ownerKey, { '2026-10-01': 40, '2026-10-02': 40, '2026-10-03': 5 })
  const latest = readOwnerLogWorkData(ownerKey, 'main')
  const nextMany = {
    ...latest,
    '2026-10-01': { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
    '2026-10-02': { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
  }
  // 미수금 일괄 입금처럼 두 날짜를 차례로 저장하는 사이에 일지 화면이 10월 3일을 저장한다.
  const many = commitMainDayLogMapToCloud({ ownerKey, logId: 'main', dateKeys: ['2026-10-01', '2026-10-02'], previousData: latest, nextData: nextMany })
  const one = startSave(ownerKey, '2026-10-03', 7)
  const [manyResult] = await Promise.all([many, one])
  assert.equal(manyResult.cloud && manyResult.ok, true, '두 날짜 서버 저장 성공')
  const work = readOwnerLogWorkData(ownerKey, 'main')
  assert.equal(work['2026-10-01']?.fixedCount, 1, '10월 1일 저장분')
  assert.equal(work['2026-10-02']?.fixedCount, 2, '10월 2일 저장분')
  assert.equal(work['2026-10-03']?.fixedCount, 7, `10월 3일 저장분이 사라짐: ${JSON.stringify(work['2026-10-03'])}`)
  endCloudSession()
})
