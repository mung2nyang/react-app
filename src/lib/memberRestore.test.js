// @ts-check
// 회원 데이터 불러오기(22-A·B): 지금 없는 날짜만 더하고, 내 차량이 아니거나 연동 차량이면 건너뛰며, 잘못된 파일은 저장 0회.
// 22-B: 저장 순서 거래처 → 일지 → 지출 → 계산서, 한 단계 실패하면 다음 단계 0회.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

/** @type {Array<Record<string, unknown>>} */
let cars = []
/** @type {Array<Record<string, unknown>>} */
let drivers = []
/** @type {Record<string, Record<string, object>>} */
let workLogs = {}
let ready = true
/** @type {Array<{ logId: string, dateKeys: string[], previousData: Record<string, object>, nextData: Record<string, object> }>} */
const commits = []
/** @type {null | ((logId: string, dateKeys: string[]) => object)} */
let commitResult = null
/** @type {string[]} */
const order = []
/** @type {Record<string, boolean>} */
const failStep = {}

mock.module('../store/ownerDataHooks.js', {
  namedExports: {
    readOwnerCars: () => cars,
    readOwnerDrivers: () => drivers,
    readOwnerWorkDataByLogId: () => workLogs,
    readOwnerClients: () => [],
    readOwnerExpenses: () => [],
    readOwnerInvoices: () => [],
  },
})
mock.module('./cloudSession.js', { namedExports: { getCloudUserId: () => 'o-1' } })
mock.module('./clientCloudSave.js', {
  namedExports: {
    saveClientsToCloud: async (/** @type {{ next: object[] }} */ args) => {
      order.push('clients')
      return failStep.clients ? { clients: [], toast: '거래처 실패', failed: true } : { clients: args.next, toast: null, failed: false }
    },
  },
})
mock.module('./expenses.js', {
  namedExports: { saveExpenses: async () => { order.push('expenses'); if (failStep.expenses) throw new Error('x') } },
})
mock.module('./invoices.js', {
  namedExports: { saveInvoices: async () => { order.push('invoices') } },
})
mock.module('./memberBackup.js', {
  namedExports: { memberBackupBlockedReason: () => (ready ? null : '기록을 아직 불러오는 중입니다.') },
})
mock.module('./dayLogCloudCommit.js', {
  namedExports: {
    commitMainDayLogMapToCloud: async (/** @type {{ logId: string, dateKeys: string[], previousData: Record<string, object>, nextData: Record<string, object> }} */ args) => {
      commits.push(args)
      order.push('days')
      if (commitResult) return commitResult(args.logId, args.dateKeys)
      return { cloud: true, ok: true, partial: false, appliedDateKeys: args.dateKeys, failedDateKeys: [], toast: null }
    },
  },
})

const { applyMemberRestore, planMemberRestore } = await import('./memberRestore.js')

const MAIN = { id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'v-main' }
const SUB = { id: 'c-sub', type: 'sub', number: '34나5678', supabaseId: 'v-sub' }
const LINKED = { id: 'c-linked', type: 'sub', number: '56다7890', supabaseId: 'v-linked' }
const LOCAL_ONLY = { id: 'c-local', type: 'sub', number: '78라1234' }

function reset() {
  cars = [MAIN, SUB, LINKED, LOCAL_ONLY]
  drivers = [{ id: 'd-1', status: 'linked', vehicleNumber: '56다7890' }, { id: 'd-2', status: 'disconnected', vehicleNumber: '34나5678' }]
  workLogs = { main: { '2026-10-01': { fixedCount: 9 } }, '34나5678': {} }
  ready = true
  commits.length = 0
  commitResult = null
  order.length = 0
  for (const key of Object.keys(failStep)) delete failStep[key]
}

test('지금 없는 날짜만 고르고, 있는 날짜는 파일 내용이 달라도 그대로 둔다', async () => {
  reset()
  const file = { workLogs: { main: { '2026-10-01': { fixedCount: 1 }, '2026-10-02': { fixedCount: 2 } }, '34나5678': { '2026-10-03': { isOff: true } } } }
  const plan = planMemberRestore('o-1', file)
  assert.ok(plan.ok)
  assert.equal(plan.counts.days, 2)
  assert.equal(plan.skipped, 0)
  const res = await applyMemberRestore('o-1', plan)
  assert.deepEqual(res, { ok: true, counts: { days: 2, clients: 0, expenses: 0, invoices: 0 }, toast: null })
  assert.deepEqual(commits.map((c) => [c.logId, c.dateKeys]), [['main', ['2026-10-02']], ['34나5678', ['2026-10-03']]])
  assert.deepEqual(commits[0].nextData, { '2026-10-01': { fixedCount: 9 }, '2026-10-02': { fixedCount: 2 } }, '기존 날짜는 Store 값 그대로')
})

test('번호가 맞는 내 차량이 없거나·서버에 없거나·연동 기사가 붙은 차량은 건너뛴다(해제된 기사는 상관없음)', async () => {
  reset()
  const day = { '2026-10-05': { fixedCount: 1 } }
  const plan = planMemberRestore('o-1', { workLogs: { '56다7890': day, '78라1234': day, '99마9999': day, '34나5678': day } })
  assert.ok(plan.ok)
  assert.equal(plan.skipped, 3)
  assert.deepEqual(plan.targets.map((t) => t.logId), ['34나5678'])
})

test('옛 모양 파일(workData만)은 메인 차량 일지로 읽는다', () => {
  reset()
  const plan = planMemberRestore('o-1', { workData: { '2026-10-06': { fixedCount: 3 } } })
  assert.ok(plan.ok)
  assert.deepEqual(plan.targets, [{ logId: 'main', records: { '2026-10-06': { fixedCount: 3 } } }])
})

test('잘못된 파일·하루 기록이 하나라도 틀리면 아무것도 고르지 않는다(저장 0회)', () => {
  reset()
  for (const file of [null, [], 'x', {}, { workLogs: { main: { '2026-13-40': { fixedCount: 1 } } } }, { workLogs: { main: { '2026-10-07': { fixedCount: -1 } } } }]) {
    const plan = planMemberRestore('o-1', /** @type {never} */ (file))
    assert.equal(plan.ok, false, JSON.stringify(file))
  }
  assert.equal(commits.length, 0)
})

test('주유·정비·기타 칸은 빼고 넣고, 그 칸만 있던 날은 건너뛴다', () => {
  reset()
  const fuel = [{ type: '경유', cost: 50000 }]
  const plan = planMemberRestore('o-1', { workLogs: { main: {
    '2026-10-08': { fixedCount: 1, fuelItems: fuel },
    '2026-10-09': { fuelItems: fuel },
  } } })
  assert.ok(plan.ok)
  assert.deepEqual(plan.targets, [{ logId: 'main', records: { '2026-10-08': { fixedCount: 1 } } }])
})

test('고른 뒤 그 날짜가 생기면(손으로 입력) 저장에서 뺀다', async () => {
  reset()
  const plan = planMemberRestore('o-1', { workLogs: { main: { '2026-10-10': { fixedCount: 1 }, '2026-10-11': { fixedCount: 2 } } } })
  assert.ok(plan.ok)
  workLogs = { ...workLogs, main: { ...workLogs.main, '2026-10-10': { fixedCount: 7 } } }
  const res = await applyMemberRestore('o-1', plan)
  assert.equal(res.counts.days, 1)
  assert.deepEqual(commits[0].dateKeys, ['2026-10-11'])
  assert.deepEqual(commits[0].nextData['2026-10-10'], { fixedCount: 7 })
})

test('서버에서 다 불러오기 전이면 저장하지 않는다', async () => {
  reset()
  const plan = planMemberRestore('o-1', { workLogs: { main: { '2026-10-12': { fixedCount: 1 } } } })
  assert.ok(plan.ok)
  ready = false
  const res = await applyMemberRestore('o-1', plan)
  assert.equal(res.ok, false)
  assert.match(String(res.toast), /불러오는 중/)
  assert.equal(commits.length, 0)
})

test('중간에 실패하면 거기서 멈추고 성공한 날 수와 기존 안내를 돌려준다', async () => {
  reset()
  const plan = planMemberRestore('o-1', { workLogs: {
    main: { '2026-10-13': { fixedCount: 1 }, '2026-10-14': { fixedCount: 1 } },
    '34나5678': { '2026-10-15': { fixedCount: 1 } },
  } })
  assert.ok(plan.ok)
  commitResult = (_logId, dateKeys) => ({
    cloud: true, ok: false, partial: true, appliedDateKeys: dateKeys.slice(0, 1), failedDateKeys: dateKeys.slice(1), toast: '일부만 저장되었습니다.',
  })
  const res = await applyMemberRestore('o-1', plan)
  assert.deepEqual(res, { ok: false, counts: { days: 1, clients: 0, expenses: 0, invoices: 0 }, toast: '일부만 저장되었습니다.' })
  assert.deepEqual(order, ['days'], '일지 실패 뒤 지출·계산서 0회')
  assert.equal(commits.length, 1, '두 번째 차량은 시도하지 않음')
})

const FILE_ALL = {
  clients: [{ id: 'cl-1', companyName: '한빛물류' }],
  workLogs: { main: { '2026-10-20': { fixedCount: 1 } } },
  expenses: [{ id: 'e-1', kind: 'fuel', date: '2026-10-20', cost: 50000 }],
  invoices: [{ id: 'sales|2026-10|한빛물류', flow: 'sales', monthKey: '2026-10', clientName: '한빛물류' }],
}

test('22-B: 거래처 → 일지 → 지출 → 계산서 순서로 저장하고 종류별 개수를 돌려준다', async () => {
  reset()
  const plan = planMemberRestore('o-1', FILE_ALL)
  assert.ok(plan.ok)
  assert.deepEqual(plan.counts, { days: 1, clients: 1, expenses: 1, invoices: 1 })
  const res = await applyMemberRestore('o-1', plan)
  assert.deepEqual(order, ['clients', 'days', 'expenses', 'invoices'])
  assert.deepEqual(res, { ok: true, counts: { days: 1, clients: 1, expenses: 1, invoices: 1 }, toast: null })
})

test('22-B: 거래처 저장이 실패하면 일지·지출·계산서는 0회', async () => {
  reset()
  failStep.clients = true
  const plan = planMemberRestore('o-1', FILE_ALL)
  assert.ok(plan.ok)
  const res = await applyMemberRestore('o-1', plan)
  assert.deepEqual(order, ['clients'])
  assert.equal(res.ok, false)
  assert.equal(res.toast, '거래처 실패')
})

test('22-B: 지출 저장이 실패하면 계산서는 0회, 앞 단계 개수는 남긴다', async () => {
  reset()
  failStep.expenses = true
  const plan = planMemberRestore('o-1', FILE_ALL)
  assert.ok(plan.ok)
  const res = await applyMemberRestore('o-1', plan)
  assert.deepEqual(order, ['clients', 'days', 'expenses'])
  assert.deepEqual(res.counts, { days: 1, clients: 1, expenses: 0, invoices: 0 })
  assert.equal(res.ok, false)
})
