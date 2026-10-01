// 로드맵 7-D-2 — 연동 해제 때 복사된 날의 배정 차량 번호(assignedVehicleNumber)를 앱이 읽고·지키고·서버에도 남긴다.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { isPersistedDayRecord, parsePersistedWorkDataMap } = await import('../store/persistDayRecord.js')
const { mergeWorkDataFromRows } = await import('./hydrateMergeWork.js')
const { saveDayRecord } = await import('../domain/day-record.js')
const { commitMainDayLogToCloud } = await import('./dayLogCloudCommit.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { setHydration, getState } = await import('../store/app-store.js')
const { commitCars, commitWorkData } = await import('../store/commitHelpers.js')

const DK = '2026-09-20'
const PLATE = '11가1111'
const CALL = { id: 'c1', client: 'A상사', fare: '100,000', paymentStatus: '미수' }

describe('저장 검사(persistDayRecord)', () => {
  test('문자열 배정차량 값은 통과, 그 값이 있는 일지 맵도 통과', () => {
    assert.equal(isPersistedDayRecord({ fixedCount: 0, assignedVehicleNumber: PLATE }), true)
    assert.ok(parsePersistedWorkDataMap({ [DK]: { fixedCount: 1, assignedVehicleNumber: PLATE } }))
  })

  test('문자열이 아니면(손상) 거부', () => {
    assert.equal(isPersistedDayRecord({ fixedCount: 0, assignedVehicleNumber: 1111 }), false)
    assert.equal(isPersistedDayRecord({ fixedCount: 0, assignedVehicleNumber: null }), false)
    assert.equal(isPersistedDayRecord({ fixedCount: 0, assignedVehicleNumber: { plate: PLATE } }), false)
  })
})

describe('불러오기(mergeWorkDataFromRows)', () => {
  test('서버 하루 줄 raw의 배정차량 값을 하루 정보에 남긴다', () => {
    const merged = mergeWorkDataFromRows({}, {
      dailyRows: [{ work_date: DK, is_off: false, fixed_count: 0, raw: { assignedVehicleNumber: PLATE, fixedCount: 0 } }],
      transportRows: [],
    })
    assert.equal(merged[DK]?.assignedVehicleNumber, PLATE)
  })
})

describe('하루 저장(saveDayRecord)', () => {
  test('그날을 고쳐 저장해도 배정차량 값 유지', () => {
    const next = saveDayRecord({ [DK]: { fixedCount: 0, callDetails: [], assignedVehicleNumber: PLATE } }, DK, { fixedCount: 2, callDetails: [CALL] })
    assert.equal(next[DK]?.assignedVehicleNumber, PLATE)
    assert.equal(next[DK]?.fixedCount, 2)
  })

  test('배정차량 날은 콜·횟수를 다 비워도 값만 남은 빈 기록으로 유지', () => {
    const next = saveDayRecord({ [DK]: { fixedCount: 2, callDetails: [CALL], assignedVehicleNumber: PLATE } }, DK, { fixedCount: 0, callDetails: [] })
    assert.ok(next[DK], '그날 기록이 남아야 한다')
    assert.equal(next[DK]?.assignedVehicleNumber, PLATE)
    assert.equal(next[DK]?.fixedCount, 0)
    assert.deepEqual(next[DK]?.callDetails, [])
  })

  test('값 없는 보통 날은 예전처럼 비우면 사라짐', () => {
    const next = saveDayRecord({ [DK]: { fixedCount: 2, callDetails: [CALL] } }, DK, { fixedCount: 0, callDetails: [] })
    assert.equal(next[DK], undefined)
  })
})

describe('서버 쓰기(commitMainDayLogToCloud)', () => {
  /** @param {string} ownerKey @param {import('../domain/dayRecordTypes.js').DayRecordLike} record */
  function begin(ownerKey, record) {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    /** @type {Array<import('../store/atomicPersist.js').JsonValue>} */
    const upserts = []
    handlers.daily_logs = { upsert: (row) => { upserts.push(row ?? null); return { data: { id: 5001 }, error: null } } }
    handlers.maintenance_records = { select: () => ({ data: [{ id: 'm-1' }], error: null }) }
    beginSessionEpoch('u1', ownerKey)
    setHydration({ status: 'ready', userId: 'u1', ownerKey })
    commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: PLATE, supabaseId: 700 }], { syncToCloud: false })
    commitWorkData(ownerKey, { [DK]: record }, { syncToCloud: false })
    return upserts
  }

  test('배정차량 날을 비워 저장: 하루 줄 삭제·raw 비우기 없이 저장(raw에 값 유지), Store에도 남음', async () => {
    const before = { fixedCount: 2, callDetails: [CALL], assignedVehicleNumber: PLATE }
    const upserts = begin('avd-empty', before)
    const nextData = saveDayRecord({ [DK]: before }, DK, { fixedCount: 0, callDetails: [] })

    const r = await commitMainDayLogToCloud({ ownerKey: 'avd-empty', logId: 'main', dateKey: DK, previousData: { [DK]: before }, nextData })

    assert.deepEqual(r, { cloud: true, ok: true, toast: null })
    assert.equal(countOf('daily_logs', 'delete'), 0)
    assert.equal(countOf('daily_logs', 'update'), 0, '빈 줄 처리(raw 비우기)를 타면 안 된다')
    assert.equal(upserts.length, 1)
    const row = /** @type {{ raw: { assignedVehicleNumber?: string } }} */ (upserts[0])
    assert.equal(row.raw.assignedVehicleNumber, PLATE)
    assert.equal(getState().workLogs['avd-empty']?.main?.[DK]?.assignedVehicleNumber, PLATE)
    endCloudSession()
  })
})
