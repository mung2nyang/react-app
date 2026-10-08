// @ts-check
// 회원 데이터 불러오기(22-B): 거래처(업체명·번호)·지출·계산서(번호) 중 지금 없는 것만, 내 차량·미연동 차량 기록만 고른다.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

/** @type {Array<Record<string, unknown>>} */
let clients = []
/** @type {Array<Record<string, unknown>>} */
let expenses = []
/** @type {Array<Record<string, unknown>>} */
let invoices = []
/** @type {Array<{ next: Array<Record<string, unknown>>, changedIds: string[] }>} */
const clientSaves = []
/** @type {Array<Array<Record<string, unknown>>>} */
const expenseSaves = []
let failExpenses = false

const cars = [
  { id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'v-main' },
  { id: 'c-sub', type: 'sub', number: '34나5678', supabaseId: 'v-sub' },
  { id: 'c-linked', type: 'sub', number: '56다7890', supabaseId: 'v-linked' },
]
const drivers = [{ id: 'd-1', status: 'linked', vehicleNumber: '56다7890' }]

mock.module('../store/ownerDataHooks.js', {
  namedExports: {
    readOwnerCars: () => cars,
    readOwnerDrivers: () => drivers,
    readOwnerClients: () => clients,
    readOwnerExpenses: () => expenses,
    readOwnerInvoices: () => invoices,
  },
})
mock.module('./cloudSession.js', { namedExports: { getCloudUserId: () => 'o-1' } })
mock.module('./clientCloudSave.js', {
  namedExports: {
    saveClientsToCloud: async (/** @type {{ next: Array<Record<string, unknown>>, changedIds: string[] }} */ args) => {
      clientSaves.push(args)
      return { clients: args.next, toast: null, failed: false }
    },
  },
})
mock.module('./expenses.js', {
  namedExports: {
    saveExpenses: async (/** @type {string} */ _owner, /** @type {Array<Record<string, unknown>>} */ items) => {
      expenseSaves.push(items)
      if (failExpenses) throw new Error('network')
    },
  },
})
mock.module('./invoices.js', { namedExports: { saveInvoices: async () => {} } })

const { describeRestoreCounts, pickMemberRecords, restoreClients, restoreExpenses } = await import('./memberRestoreRecords.js')

function reset() {
  clients = [{ id: 'cl-1', companyName: '한빛물류', fixedRouteLinked: true }]
  expenses = [{ id: 'e-1', kind: 'fuel', date: '2026-10-01', cost: 1000 }]
  invoices = [{ id: 'sales|2026-09|한빛물류', flow: 'sales', monthKey: '2026-09' }]
  clientSaves.length = 0
  expenseSaves.length = 0
  failExpenses = false
}

/** @param {object} file */
function pick(file) {
  const out = pickMemberRecords('o-1', /** @type {never} */ (file))
  assert.ok(out, '파일이 거부되면 안 됨')
  return out
}

test('거래처: 같은 업체명(앞뒤 빈칸 무시)·같은 번호는 건너뛰고, 새 것은 옛 서버 번호를 지운다', () => {
  reset()
  const out = pick({ clients: [
    { id: 'cl-9', companyName: ' 한빛물류 ' },
    { id: 'cl-1', companyName: '다른이름' },
    { id: 'cl-2', companyName: '새물류', supabaseId: 77 },
  ] })
  assert.deepEqual(out.clients, [{ id: 'cl-2', companyName: '새물류' }])
})

test('거래처: 고정노선 연결 거래처가 이미 있으면 새 거래처의 연결은 끈다', () => {
  reset()
  const out = pick({ clients: [{ id: 'cl-3', companyName: '고정물류', fixedRouteLinked: true }] })
  assert.equal(out.clients[0].fixedRouteLinked, false)
  clients = []
  const fresh = pick({ clients: [
    { id: 'cl-3', companyName: '고정물류', fixedRouteLinked: true },
    { id: 'cl-4', companyName: '고정물류2', fixedRouteLinked: true },
  ] })
  assert.deepEqual(fresh.clients.map((item) => item.fixedRouteLinked), [true, false], '한 곳만')
})

test('지출: 같은 번호는 건너뛰고, 메인·내 서브만 — 연동·없는 차량은 건너뛴 수로 센다', () => {
  reset()
  const out = pick({ expenses: [
    { id: 'e-1', kind: 'fuel', date: '2026-10-01', cost: 1 },
    { id: 'e-2', kind: 'maint', date: '2026-10-02', cost: 2 },
    { id: 'e-3', kind: 'misc', date: '2026-10-03', cost: 3, vehicleNumber: '34나5678' },
    { id: 'e-4', kind: 'fuel', date: '2026-10-04', cost: 4, vehicleNumber: '56다7890' },
    { id: 'e-5', kind: 'fuel', date: '2026-10-05', cost: 5, vehicleNumber: '99마9999' },
  ] })
  assert.deepEqual(out.expenses.map((item) => item.id), ['e-2', 'e-3'])
  assert.equal(out.skippedItems, 2)
})

test('세금계산서: 같은 번호(종류|월|상대)는 건너뛰고, 옛 서버 번호를 지우고, 연동 차량 계산서는 건너뛴다', () => {
  reset()
  const out = pick({ invoices: [
    { id: 'sales|2026-09|한빛물류', flow: 'sales', monthKey: '2026-09' },
    { id: 'sales|2026-10|한빛물류', flow: 'sales', monthKey: '2026-10', supabaseId: 5 },
    { id: 'sales|2026-10|연동', flow: 'sales', monthKey: '2026-10', carNumber: '56다7890' },
  ] })
  assert.deepEqual(out.invoices, [{ id: 'sales|2026-10|한빛물류', flow: 'sales', monthKey: '2026-10' }])
  assert.equal(out.skippedItems, 1)
})

test('모양이 하나라도 틀리면 null(거래처 이름 없음·지출 날짜 틀림·계산서 번호 없음)', () => {
  reset()
  for (const file of [
    { clients: [{ id: 'x' }] },
    { clients: {} },
    { expenses: [{ id: 'e', kind: 'fuel', date: '2026-02-30' }] },
    { invoices: [{ flow: 'sales' }] },
  ]) {
    assert.equal(pickMemberRecords('o-1', /** @type {never} */ (file)), null, JSON.stringify(file))
  }
})

test('거래처 저장: 저장 직전 그 사이 생긴 같은 이름은 빼고, 새 것만 바뀐 목록으로 넘긴다', async () => {
  reset()
  const out = pick({ clients: [{ id: 'cl-5', companyName: '가' }, { id: 'cl-6', companyName: '나' }] })
  clients = [...clients, { id: 'cl-hand', companyName: '가' }]
  const res = await restoreClients('o-1', out.clients)
  assert.deepEqual(res, { ok: true, count: 1, toast: null })
  assert.deepEqual(clientSaves[0].changedIds, ['cl-6'])
  assert.equal(clientSaves[0].next.length, 3)
})

test('지출 저장: 기존 목록 + 새 것으로 저장, 실패하면 안내만 돌려준다', async () => {
  reset()
  const out = pick({ expenses: [{ id: 'e-7', kind: 'fuel', date: '2026-10-07', cost: 7 }] })
  assert.deepEqual(await restoreExpenses('o-1', out.expenses), { ok: true, count: 1, toast: null })
  assert.deepEqual(expenseSaves[0].map((item) => item.id), ['e-1', 'e-7'])
  failExpenses = true
  const failed = await restoreExpenses('o-1', out.expenses)
  assert.equal(failed.ok, false)
  assert.match(String(failed.toast), /저장에 실패/)
})

test('개수 문구: 0인 종류는 빼고 이어 붙인다', () => {
  assert.equal(describeRestoreCounts({ days: 2, clients: 0, expenses: 3, invoices: 1 }), '일지 2일 · 지출 3건 · 세금계산서 1건')
  assert.equal(describeRestoreCounts({ days: 0, clients: 0, expenses: 0, invoices: 0 }), '')
})
