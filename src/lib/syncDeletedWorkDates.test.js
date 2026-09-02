// 재감사 3차(FAIL 지적 1번) — 빈 날 삭제가 실제로 Supabase의 daily_logs/
// transport_details까지 지우는지, 그리고 삭제 실패/transport 삭제 실패/세션 전환
// 각각에서 tombstone이 정확히 언제만 지워지는지를 실측한다. outboxFlush.test.js와
// 같은 fakeSupabaseClient 인프라를 재사용한다.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'
import { StaleSessionError } from './outboxErrors.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { syncDeletedWorkDates } = await import('./syncDeletedWorkDates.js')
const { beginSessionEpoch, captureSession, endCloudSession } = await import('./cloudSession.js')
const { commitWorkDataDeletedDates } = await import('./../store/commitHelpers.js')
const { getState } = await import('../store/app-store.js')

const CARS = [{ type: 'main', supabaseId: 900 }]

function seedTombstones(ownerKey, dateKeys) {
  const tombstones = {}
  dateKeys.forEach((d) => { tombstones[d] = '2026-08-01T00:00:00.000Z' })
  commitWorkDataDeletedDates(ownerKey, tombstones, { syncToCloud: false })
}

describe('syncDeletedWorkDates — 성공', () => {
  test('daily_logs에 행이 있으면 transport_details -> daily_logs 순서로 지우고, 성공한 날짜의 tombstone만 지운다', async () => {
    resetHandlers()
    const ownerKey = 'sdw-success'
    beginSessionEpoch('user-1', ownerKey)
    const captured = captureSession()
    seedTombstones(ownerKey, ['2026-08-01'])
    handlers.daily_logs = { select: () => ({ data: [{ id: 42 }], error: null }) }

    await syncDeletedWorkDates('user-1', ownerKey, CARS, captured)

    assert.equal(countOf('transport_details', 'delete'), 1)
    assert.equal(countOf('daily_logs', 'delete'), 1)
    assert.deepEqual(getState().workDataDeletedDates[ownerKey], {}, '성공한 날짜의 tombstone은 지워져야 한다')
    endCloudSession()
  })

  test('서버에 애초에 행이 없으면(한 번도 안 올라간 날짜) delete 호출 없이 tombstone만 지운다', async () => {
    resetHandlers()
    const ownerKey = 'sdw-no-row'
    beginSessionEpoch('user-1', ownerKey)
    const captured = captureSession()
    seedTombstones(ownerKey, ['2026-08-02'])
    handlers.daily_logs = { select: () => ({ data: [], error: null }) }

    await syncDeletedWorkDates('user-1', ownerKey, CARS, captured)

    assert.equal(countOf('transport_details', 'delete'), 0, '지울 행이 없으니 자식 테이블 delete를 부르면 안 된다')
    assert.equal(countOf('daily_logs', 'delete'), 0)
    assert.deepEqual(getState().workDataDeletedDates[ownerKey], {})
    endCloudSession()
  })

  test('tombstone이 없으면(빈 날 삭제가 없었다) 아무 원격 호출도 하지 않는다', async () => {
    resetHandlers()
    const ownerKey = 'sdw-empty'
    beginSessionEpoch('user-1', ownerKey)
    const captured = captureSession()

    await syncDeletedWorkDates('user-1', ownerKey, CARS, captured)

    assert.equal(countOf('daily_logs', 'select'), 0)
    endCloudSession()
  })
})

describe('실패 주입 — daily_logs 조회 실패', () => {
  test('조회가 error를 반환하면 던지고, tombstone은 그대로 남는다(재시도 대상)', async () => {
    resetHandlers()
    const ownerKey = 'sdw-find-fail'
    beginSessionEpoch('user-1', ownerKey)
    const captured = captureSession()
    seedTombstones(ownerKey, ['2026-08-03'])
    handlers.daily_logs = { select: () => ({ data: null, error: { message: 'timeout' } }) }

    await assert.rejects(() => syncDeletedWorkDates('user-1', ownerKey, CARS, captured), (err) => err.message === 'timeout')
    assert.deepEqual(getState().workDataDeletedDates[ownerKey], { '2026-08-03': '2026-08-01T00:00:00.000Z' })
    assert.equal(countOf('transport_details', 'delete'), 0)
    endCloudSession()
  })
})

describe('실패 주입 — transport_details 삭제 실패(사용자 지시: transport 삭제 실패)', () => {
  test('자식 테이블(transport_details) 삭제가 실패하면 daily_logs는 지우지 않고, tombstone도 남는다', async () => {
    resetHandlers()
    const ownerKey = 'sdw-transport-fail'
    beginSessionEpoch('user-1', ownerKey)
    const captured = captureSession()
    seedTombstones(ownerKey, ['2026-08-04'])
    handlers.daily_logs = { select: () => ({ data: [{ id: 43 }], error: null }) }
    handlers.transport_details = { delete: () => ({ data: null, error: { message: 'RLS violation' } }) }

    await assert.rejects(() => syncDeletedWorkDates('user-1', ownerKey, CARS, captured), (err) => err.message === 'RLS violation')
    assert.equal(countOf('daily_logs', 'delete'), 0, 'transport_details가 실패했으면 daily_logs는 지우면 안 된다')
    assert.deepEqual(getState().workDataDeletedDates[ownerKey], { '2026-08-04': '2026-08-01T00:00:00.000Z' })
    endCloudSession()
  })
})

describe('실패 주입 — daily_logs 삭제 실패(transport_details는 이미 지워짐)', () => {
  test('daily_logs 삭제가 실패하면 tombstone은 남고, 재시도 시 이미 지워진 transport_details를 다시 지워도(0행) 안전하다', async () => {
    resetHandlers()
    const ownerKey = 'sdw-daily-fail'
    beginSessionEpoch('user-1', ownerKey)
    const captured = captureSession()
    seedTombstones(ownerKey, ['2026-08-05'])
    handlers.daily_logs = { select: () => ({ data: [{ id: 44 }], error: null }), delete: () => ({ data: null, error: { message: 'timeout' } }) }

    await assert.rejects(() => syncDeletedWorkDates('user-1', ownerKey, CARS, captured), (err) => err.message === 'timeout')
    assert.equal(countOf('transport_details', 'delete'), 1, '자식 테이블 삭제는 이미 시도됐어야 한다')
    assert.deepEqual(getState().workDataDeletedDates[ownerKey], { '2026-08-05': '2026-08-01T00:00:00.000Z' })

    handlers.daily_logs = { select: () => ({ data: [{ id: 44 }], error: null }) }
    await syncDeletedWorkDates('user-1', ownerKey, CARS, captured)
    assert.equal(countOf('transport_details', 'delete'), 2, '재시도가 이미 빈 자식 테이블을 다시 지워도 에러 없이 통과해야 한다')
    assert.deepEqual(getState().workDataDeletedDates[ownerKey], {})
    endCloudSession()
  })
})

describe('실패 주입 — 여러 날짜 처리 도중 세션 전환(로그아웃/owner 전환)', () => {
  test('첫 날짜 처리 후 세션이 바뀌면, 그 날짜의 tombstone만 지워지고 나머지 날짜는 원격 호출 없이 그대로 남는다', async () => {
    resetHandlers()
    const ownerKey = 'sdw-session-switch'
    beginSessionEpoch('user-1', ownerKey)
    const captured = captureSession()
    seedTombstones(ownerKey, ['2026-08-06', '2026-08-07'])
    let selectCalls = 0
    handlers.daily_logs = {
      select: () => {
        selectCalls += 1
        if (selectCalls === 2) endCloudSession() // 첫 날짜 완료 직후 로그아웃을 흉내낸다
        return { data: [{ id: 45 }], error: null }
      },
    }

    await assert.rejects(() => syncDeletedWorkDates('user-1', ownerKey, CARS, captured), StaleSessionError)

    assert.equal(countOf('transport_details', 'delete'), 1, '두 번째 날짜는 세션이 이미 무효화된 뒤라 자식 테이블까지 가면 안 된다')
    const remaining = getState().workDataDeletedDates[ownerKey]
    assert.ok(!('2026-08-06' in remaining), '세션 전환 전에 성공한 첫 날짜의 tombstone은 지워져야 한다')
    assert.ok('2026-08-07' in remaining, '세션 전환 후 처리 못 한 두 번째 날짜의 tombstone은 남아야 한다')
  })
})
