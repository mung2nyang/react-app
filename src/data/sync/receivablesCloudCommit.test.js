// 8-B — 미수 쓰기 창구 통일: persistReceivableWorkDataChange + commitMainDayLogMapToCloud
// 일지↔미수 교차 반영 및 일괄 부분 실패 시나리오(G-2/G-3/G-4) 검증.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
const { mock } = await import('node:test')
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { persistReceivableWorkDataChange, markMonthlyReceivablesPaid } = await import('./ownerFinance.ts')
const { commitMainDayLogMapToCloud, commitMainDayLogToCloud } = await import('./dayLogCloudCommit.ts')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration, getState } = await import('../store/app-store.ts')
const { commitCars, commitLogWorkData, commitWorkData } = await import('../store/commitHelpers.ts')
const { readOwnerLogWorkData, readOwnerWorkData } = await import('../store/ownerDataHooks.ts')
const { getReceivableItems, getDetailPaymentSummary } = await import('../../domain/finance.ts')
const { FIXTURE_DETAIL_ID_MAY10_MAIN, FIXTURE_SETTINGS, FIXTURE_WORK } = await import('../../domain/finance.fixtures.ts')
const { markReceivableItemPaid, addPartialPayment, toggleCallPaymentStatus } = await import('../../domain/payments.ts')

const FAIL_FAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED = '로그인 정보가 바뀌어 저장하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' // 로드맵 56-B-1 ③
const DK = '2026-05-10'

/** @param {string} userId @param {string} ownerKey @param {boolean} [ready] */
function beginLoggedIn(userId, ownerKey, ready = true) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.daily_logs = { upsert: () => ({ data: { id: 5001 }, error: null }) }
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: ready ? 'ready' : 'failed', userId, ownerKey })
  commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 700 }])
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

/** @param {Record<string, import('../../domain/dayRecordTypes.ts').DayRecordLike>} main */
function seedMain(ownerKey, main) {
  commitWorkData(ownerKey, main)
}

describe('8-B receivables cloud commit — 시나리오 A~G', () => {
  test('A — 미수 입금 후 Store·일지 draft 소스에 동일 payments 반영', async () => {
    beginLoggedIn('u-rc-a', 'rc-a')
    seedMain('rc-a', clone(FIXTURE_WORK.main))
    const prev = { main: readOwnerWorkData('rc-a') }
    const paid = markReceivableItemPaid(prev.main, DK, FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.ok(!paid.error && paid.data)
    const next = { main: paid.data }

    const r = await persistReceivableWorkDataChange('rc-a', next)
    assert.equal(r.ok, true)
    assert.equal(countOf('daily_logs', 'upsert'), 1)

    const stored = readOwnerWorkData('rc-a')[DK]?.callDetails?.find((d) => d.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.equal(getDetailPaymentSummary(stored).status, 'paid')
    endCloudSession()
  })

  test('B — 일지 toggleCallPaymentStatus + commitMainDayLogToCloud 후 미수 목록에서 제외', async () => {
    beginLoggedIn('u-rc-b', 'rc-b')
    seedMain('rc-b', clone(FIXTURE_WORK.main))
    const previous = readOwnerWorkData('rc-b')
    const toggled = toggleCallPaymentStatus({ [DK]: previous[DK] }, DK, FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.ok(toggled.data)
    const nextMain = { ...previous, [DK]: toggled.data[DK] }

    const r = await commitMainDayLogToCloud({ ownerKey: 'rc-b', logId: 'main', dateKey: DK, previousData: previous, nextData: nextMain })
    assert.deepEqual(r, { cloud: true, ok: true, toast: null })

    const items = getReceivableItems(FIXTURE_SETTINGS, { main: readOwnerWorkData('rc-b') })
    assert.ok(!items.some((item) => item.detailId === FIXTURE_DETAIL_ID_MAY10_MAIN))
    endCloudSession()
  })

  test('C — 미수 부분입금 후 일지 getDetailPaymentSummary가 partial', async () => {
    beginLoggedIn('u-rc-c', 'rc-c')
    seedMain('rc-c', clone(FIXTURE_WORK.main))
    const prev = { main: readOwnerWorkData('rc-c') }
    const partial = addPartialPayment(prev.main, DK, FIXTURE_DETAIL_ID_MAY10_MAIN, '30000')
    assert.ok(partial.data)
    const r = await persistReceivableWorkDataChange('rc-c', { main: partial.data })
    assert.equal(r.ok, true)

    const detail = readOwnerWorkData('rc-c')[DK]?.callDetails?.find((d) => d.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    const summary = getDetailPaymentSummary(detail)
    assert.equal(summary.status, 'partial')
    assert.equal(summary.remainingAmount, 70000)
    endCloudSession()
  })

  test('D — 서버 실패 시 Store 미변경(revert-and-confirm-fail)', async () => {
    beginLoggedIn('u-rc-d', 'rc-d')
    handlers.daily_logs = { upsert: () => { throw new Error('network down') } }
    seedMain('rc-d', clone(FIXTURE_WORK.main))
    const prev = { main: readOwnerWorkData('rc-d') }
    const paid = markReceivableItemPaid(prev.main, DK, FIXTURE_DETAIL_ID_MAY10_MAIN)
    const r = await persistReceivableWorkDataChange('rc-d', { main: paid.data })
    assert.equal(r.ok, false)
    assert.equal(r.toast, FAIL_FAST)
    const detail = readOwnerWorkData('rc-d')[DK]?.callDetails?.find((d) => d.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.equal(getDetailPaymentSummary(detail).status, 'unpaid')
    endCloudSession()
  })

  test('E — 세션 전환: upsert await 중 로그아웃하면 Store 미반영', async () => {
    beginLoggedIn('u-rc-e', 'rc-e')
    seedMain('rc-e', clone(FIXTURE_WORK.main))
    /** @type {() => void} */ let releaseUpsert = () => {}
    const gate = /** @type {Promise<void>} */ (new Promise((resolve) => { releaseUpsert = resolve }))
    handlers.daily_logs = { upsert: () => gate.then(() => ({ data: { id: 5001 }, error: null })) }
    const prev = { main: readOwnerWorkData('rc-e') }
    const paid = markReceivableItemPaid(prev.main, DK, FIXTURE_DETAIL_ID_MAY10_MAIN)
    const promise = persistReceivableWorkDataChange('rc-e', { main: paid.data })
    endCloudSession()
    releaseUpsert()
    const r = await promise
    assert.equal(r.ok, false)
    assert.equal(r.toast, SESSION_CHANGED)
    const detail = readOwnerWorkData('rc-e')[DK]?.callDetails?.find((d) => d.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.equal(getDetailPaymentSummary(detail).status, 'unpaid')
  })

  test('F — 게스트: supabase 0회, Store 즉시 반영', async () => {
    resetHandlers()
    endCloudSession()
    seedMain('rc-guest', clone(FIXTURE_WORK.main))
    const prev = { main: readOwnerWorkData('rc-guest') }
    const paid = markReceivableItemPaid(prev.main, DK, FIXTURE_DETAIL_ID_MAY10_MAIN)
    const r = await persistReceivableWorkDataChange('rc-guest', { main: paid.data })
    assert.equal(r.ok, true)
    assert.equal(countOf('daily_logs', 'upsert'), 0)
    const detail = readOwnerWorkData('rc-guest')[DK]?.callDetails?.find((d) => d.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.equal(getDetailPaymentSummary(detail).status, 'paid')
  })

  test('G-1 — 일괄 3건 전부 성공', async () => {
    beginLoggedIn('u-rc-g1', 'rc-g1')
    const main = {
      '2026-05-10': { callDetails: [{ id: 'g1-d1', client: '한진', fare: '50000', payments: [] }] },
      '2026-05-12': { callDetails: [{ id: 'g1-d2', client: '한진', fare: '60000', payments: [] }] },
      '2026-05-14': { callDetails: [{ id: 'g1-d3', client: '한진', fare: '70000', payments: [] }] },
    }
    seedMain('rc-g1', main)
    const settings = { ...FIXTURE_SETTINGS, paymentOn: true }
    const next = markMonthlyReceivablesPaid({ main }, settings, '한진', '2026-05')
    const r = await persistReceivableWorkDataChange('rc-g1', next)
    assert.equal(r.ok, true)
    assert.equal(countOf('daily_logs', 'upsert'), 3)
    assert.equal(getReceivableItems(settings, { main: readOwnerWorkData('rc-g1') }).length, 0)
    endCloudSession()
  })

  test('G-2 — 2건 성공 후 3번째 실패: 부분 Store 반영 + 부분 토스트', async () => {
    beginLoggedIn('u-rc-g2', 'rc-g2')
    let upsertCount = 0
    handlers.daily_logs = {
      upsert: () => {
        upsertCount += 1
        if (upsertCount >= 3) throw new Error('third fails')
        return { data: { id: 5000 + upsertCount }, error: null }
      },
    }
    const dateKeys = ['2026-05-10', '2026-05-12', '2026-05-14']
    const main = Object.fromEntries(dateKeys.map((dk, i) => [dk, {
      callDetails: [{ id: `g2-d${i}`, client: '한진', fare: '50000', payments: [] }],
    }]))
    seedMain('rc-g2', main)
    const nextMain = clone(main)
    for (const dk of dateKeys) {
      const paid = markReceivableItemPaid(nextMain, dk, nextMain[dk].callDetails[0].id)
      Object.assign(nextMain, paid.data)
    }

    const r = await commitMainDayLogMapToCloud({
      ownerKey: 'rc-g2', logId: 'main', dateKeys, previousData: main, nextData: nextMain,
    })
    assert.equal(r.cloud, true)
    assert.equal(r.ok, false)
    assert.equal(r.partial, true)
    assert.deepEqual(r.appliedDateKeys, dateKeys.slice(0, 2))
    assert.deepEqual(r.failedDateKeys, [dateKeys[2]])
    assert.match(r.toast || '', /일부만 저장되었습니다/)
    assert.equal(getDetailPaymentSummary(readOwnerWorkData('rc-g2')['2026-05-10'].callDetails[0]).status, 'paid')
    assert.equal(getDetailPaymentSummary(readOwnerWorkData('rc-g2')['2026-05-14'].callDetails[0]).status, 'unpaid')
    endCloudSession()
  })

  test('G-3 — 첫 건부터 실패: Store 변경 없음', async () => {
    beginLoggedIn('u-rc-g3', 'rc-g3')
    handlers.daily_logs = { upsert: () => { throw new Error('fail immediately') } }
    const main = {
      '2026-05-10': { callDetails: [{ id: 'g3-d1', client: '한진', fare: '50000', payments: [] }] },
      '2026-05-12': { callDetails: [{ id: 'g3-d2', client: '한진', fare: '60000', payments: [] }] },
    }
    seedMain('rc-g3', main)
    const nextMain = clone(main)
    for (const dk of Object.keys(main)) {
      const paid = markReceivableItemPaid(nextMain, dk, nextMain[dk].callDetails[0].id)
      Object.assign(nextMain, paid.data)
    }

    const r = await commitMainDayLogMapToCloud({
      ownerKey: 'rc-g3', logId: 'main', dateKeys: ['2026-05-10', '2026-05-12'], previousData: main, nextData: nextMain,
    })
    assert.equal(r.ok, false)
    assert.equal(r.partial, false)
    assert.deepEqual(r.appliedDateKeys, [])
    assert.equal(r.toast, FAIL_FAST)
    assert.equal(getDetailPaymentSummary(readOwnerWorkData('rc-g3')['2026-05-10'].callDetails[0]).status, 'unpaid')
    endCloudSession()
  })

  test('G-4 — 2건 성공 후 세션 전환: 부분 Store + SESSION_CHANGED 토스트', async () => {
    beginLoggedIn('u-rc-g4', 'rc-g4')
    let upsertCount = 0
    /** @type {() => void} */ let releaseThird = () => {}
    const thirdGate = /** @type {Promise<void>} */ (new Promise((resolve) => { releaseThird = resolve }))
    handlers.daily_logs = {
      upsert: () => {
        upsertCount += 1
        if (upsertCount >= 3) return thirdGate.then(() => ({ data: { id: 5099 }, error: null }))
        return { data: { id: 5000 + upsertCount }, error: null }
      },
    }
    const dateKeys = ['2026-05-10', '2026-05-12', '2026-05-14']
    const main = Object.fromEntries(dateKeys.map((dk, i) => [dk, {
      callDetails: [{ id: `g4-d${i}`, client: '한진', fare: '50000', payments: [] }],
    }]))
    seedMain('rc-g4', main)
    const nextMain = clone(main)
    for (const dk of dateKeys) {
      const paid = markReceivableItemPaid(nextMain, dk, nextMain[dk].callDetails[0].id)
      Object.assign(nextMain, paid.data)
    }

    const promise = commitMainDayLogMapToCloud({
      ownerKey: 'rc-g4', logId: 'main', dateKeys, previousData: main, nextData: nextMain,
    })
    while (upsertCount < 3) await Promise.resolve()
    endCloudSession()
    releaseThird()
    const r = await promise
    assert.equal(r.partial, true)
    assert.equal(r.toast, SESSION_CHANGED)
    assert.deepEqual(r.appliedDateKeys, dateKeys.slice(0, 2))
    assert.equal(getDetailPaymentSummary(readOwnerWorkData('rc-g4')['2026-05-10'].callDetails[0]).status, 'paid')
    assert.equal(getDetailPaymentSummary(readOwnerWorkData('rc-g4')['2026-05-14'].callDetails[0]).status, 'unpaid')
  })
})

// 로드맵 64 — 기사(서브) 차량 운행도 미수 화면에서 서버에 저장한다.
describe('64 receivables cloud commit — 기사 차량', () => {
  const PLATE = '34나5678'
  const SUB_DK = '2026-05-11'

  /** @param {string} userId @param {string} ownerKey */
  function beginWithSubCar(userId, ownerKey) {
    beginLoggedIn(userId, ownerKey)
    commitCars(ownerKey, [
      { id: 'car-main', type: 'main', number: '12가3456', supabaseId: 700 },
      { id: 'car-sub', type: 'sub', number: PLATE, supabaseId: 701 },
    ])
  }

  /** @param {string} id */
  function subLog(id) {
    return { [SUB_DK]: { callDetails: [{ id, client: '한진', fare: '40000', payments: [] }] } }
  }

  /** @param {string} ownerKey @param {string} logId @param {string} dateKey @param {string} id */
  function statusOf(ownerKey, logId, dateKey, id) {
    const detail = readOwnerLogWorkData(ownerKey, logId)[dateKey]?.callDetails?.find((d) => d.id === id)
    assert.ok(detail, `${logId} ${dateKey} ${id} 운행이 있어야 한다`)
    return getDetailPaymentSummary(detail).status
  }

  /** @param {string} ownerKey @param {string} id */
  function subStatus(ownerKey, id) {
    return statusOf(ownerKey, PLATE, SUB_DK, id)
  }

  test('H-1 — 기사 차량 운행 입금 완료: 그 차량으로 서버 저장 후 Store 반영', async () => {
    beginWithSubCar('u-rc-h1', 'rc-h1')
    /** @type {Array<import('../store/atomicPersist.ts').JsonValue>} */
    const upserts = []
    handlers.daily_logs = { upsert: (row) => { upserts.push(row ?? null); return { data: { id: 6001 }, error: null } } }
    commitLogWorkData('rc-h1', PLATE, subLog('h1-d1'))
    const paid = markReceivableItemPaid(readOwnerLogWorkData('rc-h1', PLATE), SUB_DK, 'h1-d1')
    assert.ok(paid.data)

    const r = await persistReceivableWorkDataChange('rc-h1', { main: readOwnerWorkData('rc-h1'), [PLATE]: paid.data })
    assert.deepEqual(r, { ok: true, partial: false, toast: null })
    assert.equal(countOf('daily_logs', 'upsert'), 1)
    assert.equal(countOf('rpc', 'replace_transport_details'), 1)
    const row = /** @type {{ vehicle_id?: number, work_date?: string }} */ (upserts[0])
    assert.equal(row.vehicle_id, 701)
    assert.equal(row.work_date, SUB_DK)
    assert.equal(subStatus('rc-h1', 'h1-d1'), 'paid')
    endCloudSession()
  })

  test('H-2 — 기사 차량 서버 실패: Store 그대로, 실패 안내', async () => {
    beginWithSubCar('u-rc-h2', 'rc-h2')
    handlers.daily_logs = { upsert: () => { throw new Error('network down') } }
    commitLogWorkData('rc-h2', PLATE, subLog('h2-d1'))
    const paid = markReceivableItemPaid(readOwnerLogWorkData('rc-h2', PLATE), SUB_DK, 'h2-d1')

    const r = await persistReceivableWorkDataChange('rc-h2', { main: readOwnerWorkData('rc-h2'), [PLATE]: paid.data })
    assert.deepEqual(r, { ok: false, partial: false, toast: FAIL_FAST })
    assert.equal(subStatus('rc-h2', 'h2-d1'), 'unpaid')
    endCloudSession()
  })

  test('H-3 — 한 달치에 메인+기사 차량: 둘 다 서버 저장 / 기사 실패면 메인만 반영·부분 안내', async () => {
    beginWithSubCar('u-rc-h3', 'rc-h3')
    const main = { [DK]: { callDetails: [{ id: 'h3-m1', client: '한진', fare: '50000', payments: [] }] } }
    seedMain('rc-h3', main)
    commitLogWorkData('rc-h3', PLATE, subLog('h3-s1'))
    /** @type {import('../../domain/financeTypes.ts').FinanceSettings} */
    const settings = { paymentOn: true, subPaymentOn: true, clients: [], cars: [{ type: 'sub', number: PLATE }] }
    const next = markMonthlyReceivablesPaid({ main, [PLATE]: readOwnerLogWorkData('rc-h3', PLATE) }, settings, '한진', '2026-05')

    /** @type {Array<number|undefined>} */
    const vehicleIds = []
    handlers.daily_logs = {
      upsert: (row) => {
        vehicleIds.push(/** @type {{ vehicle_id?: number }} */ (row ?? {}).vehicle_id)
        return { data: { id: 7000 + vehicleIds.length }, error: null }
      },
    }
    const ok = await persistReceivableWorkDataChange('rc-h3', next)
    assert.deepEqual(ok, { ok: true, partial: false, toast: null })
    assert.deepEqual(vehicleIds, [700, 701])
    assert.equal(statusOf('rc-h3', 'main', DK, 'h3-m1'), 'paid')
    assert.equal(subStatus('rc-h3', 'h3-s1'), 'paid')
    endCloudSession()

    beginWithSubCar('u-rc-h3b', 'rc-h3b')
    seedMain('rc-h3b', clone(main))
    commitLogWorkData('rc-h3b', PLATE, subLog('h3-s1'))
    handlers.daily_logs = {
      upsert: (row) => {
        if (/** @type {{ vehicle_id?: number }} */ (row ?? {}).vehicle_id === 701) throw new Error('sub fails')
        return { data: { id: 7100 }, error: null }
      },
    }
    const partial = await persistReceivableWorkDataChange('rc-h3b', next)
    assert.equal(partial.ok, false)
    assert.equal(partial.partial, true)
    assert.match(partial.toast || '', /일부만 저장되었습니다. \(성공 1건, 실패 1건\)/)
    assert.equal(statusOf('rc-h3b', 'main', DK, 'h3-m1'), 'paid')
    assert.equal(subStatus('rc-h3b', 'h3-s1'), 'unpaid')
    endCloudSession()
  })

  test('H-4 — 비회원 기사 차량: 서버 0회, 기기 저장', async () => {
    resetHandlers()
    endCloudSession()
    commitLogWorkData('rc-guest-sub', PLATE, subLog('h4-d1'))
    const paid = markReceivableItemPaid(readOwnerLogWorkData('rc-guest-sub', PLATE), SUB_DK, 'h4-d1')
    const r = await persistReceivableWorkDataChange('rc-guest-sub', { main: {}, [PLATE]: paid.data })
    assert.deepEqual(r, { ok: true, partial: false, toast: null })
    assert.equal(countOf('daily_logs', 'upsert'), 0)
    assert.equal(subStatus('rc-guest-sub', 'h4-d1'), 'paid')
  })
})
