import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

let scheduleCloudSyncCallCount = 0
mock.module('../lib/syncQueue.js', {
  namedExports: {
    scheduleCloudSync: () => { scheduleCloudSyncCallCount += 1 },
    flushCloudSync: async () => {},
  },
})

const { storageKeyFor, storageKeyForLog } = await import('./persist.js')
const { getState, subscribe, commitBatch } = await import('./app-store.js')
const { initializeOwnerFromPersist } = await import('./owner-state.js')
const { saveProfile } = await import('../lib/profile.js')
const { commitCars, commitClients, commitInvoices } = await import('./commitHelpers.js')
const { saveExpenses, upsertExpense, emptyExpenseDraft } = await import('../lib/expenses.js')
const { persistInvoiceRecord } = await import('../domain/invoices.js')
const { buildTaxInvoiceEntry } = await import('../domain/financeTaxInvoiceEntries.js')
const { getPendingOps, outboxStorageKey } = await import('../lib/mutationOutbox.js')
const { pendingDayWriteCount, hasUnsafePendingWrites } = await import('../lib/pendingWorkDataWrites.js')
const { readPersistDomain } = await import('./persistDomainRead.js')
const { readLogWorkData } = await import('./persist.js')

function methodCounts() {
  return { ...stubSupabaseCallCounts }
}

/** @param {string} owner */
function layers(owner) {
  return {
    carsRaw: localStorage.getItem(storageKeyFor('cars', owner)),
    profileRaw: localStorage.getItem(storageKeyFor('profile', owner)),
    invoicesRaw: localStorage.getItem(storageKeyFor('invoices', owner)),
    workRaw: localStorage.getItem(storageKeyFor('workData', owner)),
    journal: localStorage.getItem(`reactPracticeDirtyJournal:${owner}`),
    outbox: localStorage.getItem(outboxStorageKey(owner)),
    pendingOps: JSON.stringify(getPendingOps(owner)),
    pendingCount: pendingDayWriteCount(),
    unsafe: hasUnsafePendingWrites(),
    supabase: methodCounts(),
    schedule: scheduleCloudSyncCallCount,
  }
}

function wipeOwnerMemory(owner) {
  commitBatch([
    { domain: 'cars', ownerKey: owner, value: [] },
    { domain: 'profile', ownerKey: owner, value: {} },
    { domain: 'invoices', ownerKey: owner, value: [] },
    { domain: 'workData', ownerKey: owner, value: {} },
  ], { persist: false, syncToCloud: false, replaceWorkLogs: { ownerKey: owner, next: { main: {} } } })
}

test('saveProfile 결과는 persist 왕복 후 initialize에서 복원된다', async () => {
  const owner = 'roundtrip-profile'
  resetStubSupabaseCallCounts()
  await saveProfile(owner, { name: '홍길동', bizRepresentative: '대표자', accountHolder: '예금주', phone: '010' })
  assert.equal(readPersistDomain('profile', owner).kind, 'value')
  const before = layers(owner)
  wipeOwnerMemory(owner)
  assert.equal(getState().profile[owner]?.bizRepresentative, undefined)
  scheduleCloudSyncCallCount = before.schedule
  resetStubSupabaseCallCounts()
  let notifyCount = 0
  const unsub = subscribe(() => { notifyCount += 1 })
  initializeOwnerFromPersist(owner)
  unsub()
  assert.equal(notifyCount, 1)
  assert.equal(readPersistDomain('profile', owner).kind, 'value')
  assert.equal(getState().profile[owner]?.name, '홍길동')
  assert.equal(getState().profile[owner]?.bizRepresentative, '대표자')
  assert.equal(getState().profile[owner]?.accountHolder, '예금주')
  const after = layers(owner)
  assert.equal(after.profileRaw, before.profileRaw)
  assert.equal(after.journal, before.journal)
  assert.equal(after.outbox, before.outbox)
  assert.equal(after.pendingOps, before.pendingOps)
  assert.equal(after.pendingCount, before.pendingCount)
  assert.equal(after.unsafe, before.unsafe)
  assert.deepEqual(after.supabase, before.supabase)
  assert.equal(after.schedule, before.schedule)
})

test('계산서 draft/issued는 persist 왕복 후 supabaseId가 남는다', () => {
  const owner = 'roundtrip-invoice'
  resetStubSupabaseCallCounts()
  const built = buildTaxInvoiceEntry({
    partyKey: '한진', clientName: '한진', partyType: 'client',
    carNumber: '11가1111', count: 2, supplyAmount: 10000, taxAmount: 1000, totalAmount: 11000,
    vehicleNumbers: ['11가1111'],
  }, '2026-08', 'sales', [], {})
  const withDraft = persistInvoiceRecord([], {
    ...built, issueDate: '2026-08-31', updatedAt: '2026-08-30T00:00:00.000Z', supabaseId: 'inv-sb-9',
    supplierKey: 'main',
    supplierBiz: {
      sameAsOwner: true, name: '공급자', bizNumber: '111-11-11111', representative: '대표',
      address: '서울', bizType: '운수', bizItem: '화물', email: 'a@b.c',
    },
  })
  const withIssued = persistInvoiceRecord(withDraft, {
    ...withDraft[0], status: 'issued', issuedAt: '2026-08-30T01:00:00.000Z',
  })
  commitInvoices(owner, withIssued, { syncToCloud: false })
  commitCars(owner, [{
    id: 'car-1', number: '11가1111', type: 'main', supabaseId: 501,
    commType: 'percent',
  }], { syncToCloud: false })
  assert.equal(readPersistDomain('invoices', owner).kind, 'value')
  assert.equal(readPersistDomain('cars', owner).kind, 'value')
  const before = layers(owner)
  wipeOwnerMemory(owner)
  scheduleCloudSyncCallCount = before.schedule
  resetStubSupabaseCallCounts()
  let notifyCount = 0
  const unsub = subscribe(() => { notifyCount += 1 })
  initializeOwnerFromPersist(owner)
  unsub()
  assert.equal(notifyCount, 1)
  assert.equal(getState().invoices[owner]?.[0]?.id, built.id)
  assert.equal(getState().invoices[owner]?.[0]?.status, 'issued')
  assert.equal(getState().invoices[owner]?.[0]?.supabaseId, 'inv-sb-9')
  assert.equal(getState().invoices[owner]?.[0]?.clientRepresentative !== undefined, true)
  assert.equal(getState().invoices[owner]?.[0]?.supplierBiz?.name, '공급자')
  assert.equal(getState().invoices[owner]?.[0]?.supplierKey, 'main')
  assert.equal(getState().cars[owner]?.[0]?.supabaseId, 501)
  const after = layers(owner)
  assert.equal(after.carsRaw, before.carsRaw)
  assert.equal(after.invoicesRaw, before.invoicesRaw)
  assert.equal(after.journal, before.journal)
  assert.equal(after.outbox, before.outbox)
  assert.equal(after.pendingOps, before.pendingOps)
  assert.equal(after.unsafe, before.unsafe)
  assert.deepEqual(after.supabase, before.supabase)
  assert.equal(after.schedule, before.schedule)
})

test('레거시 off·dailyDistance·insuranceFee·바닐라 비용은 initialize 왕복 후 보존된다', () => {
  const owner = 'roundtrip-vanilla-day'
  resetStubSupabaseCallCounts()
  const dateKey = '2026-08-01'
  localStorage.setItem(storageKeyForLog(owner, 'main'), JSON.stringify({
    [dateKey]: 'off',
    '2026-08-02': {
      isOff: false,
      dailyDistance: 10,
      callDetails: [{ loadLoc: '상차', fare: '1,000', insuranceFee: '500' }],
      fuelItems: [{ type: '주유', cost: '80,000', subsidy: '5,000', liter: 40, mileage: 100 }],
      maintItems: [{ name: '오일', fare: '30,000', category: '소모품', payment: '카드' }],
      miscItems: [{ name: '통행료', fare: '8,000', category: '통행료', payment: '카드' }],
    },
  }))
  assert.equal(readLogWorkData(owner, 'main').kind, 'value')
  const before = layers(owner)
  wipeOwnerMemory(owner)
  scheduleCloudSyncCallCount = before.schedule
  resetStubSupabaseCallCounts()
  let notifyCount = 0
  const unsub = subscribe(() => { notifyCount += 1 })
  initializeOwnerFromPersist(owner)
  unsub()
  assert.equal(notifyCount, 1)
  assert.equal(getState().workLogs[owner]?.main?.[dateKey]?.isOff, true)
  const day = getState().workLogs[owner]?.main?.['2026-08-02']
  assert.equal(day?.dailyDistance, 10)
  assert.equal(day?.callDetails?.[0]?.insuranceFee, '500')
  assert.equal(day?.fuelItems?.[0]?.type, '주유')
  assert.equal(day?.maintItems?.[0]?.name, '오일')
  assert.equal(day?.miscItems?.[0]?.name, '통행료')
  const after = layers(owner)
  assert.equal(after.workRaw, before.workRaw)
  assert.equal(after.journal, before.journal)
  assert.equal(after.outbox, before.outbox)
  assert.equal(after.pendingOps, before.pendingOps)
  assert.equal(after.pendingCount, before.pendingCount)
  assert.equal(after.unsafe, before.unsafe)
  assert.deepEqual(after.supabase, before.supabase)
  assert.equal(after.schedule, before.schedule)
})

test('로드맵 25: 비회원 기사 차량 지출(vehicleNumber)이 있어도 다시 켜면 차량·거래처·지출이 그대로 불러와진다', async () => {
  const owner = 'roundtrip-guest-sub-expense'
  commitCars(owner, [{ id: 'c-main', type: 'main', number: '12가3456' }, { id: 'c-sub', type: 'sub', number: '34나5678' }])
  commitClients(owner, [{ id: 'cl-1', companyName: '한빛물류' }])
  // 지출 번호는 저장 시각(1/1000초)이라 테스트처럼 빠르면 겹침 — 번호는 직접 정한다.
  const mainItem = { ...upsertExpense([], { ...emptyExpenseDraft('fuel', '2026-10-09'), cost: '50000' }).items[0], id: 'exp-main' }
  await saveExpenses(owner, [mainItem])
  const subItem = { ...upsertExpense([], { ...emptyExpenseDraft('maint', '2026-10-09', '34나5678'), name: '엔진오일', cost: '80000' }).items[0], id: 'exp-sub' }
  await saveExpenses(owner, [...(getState().expenses[owner] || []), subItem])
  assert.equal(readPersistDomain('expenses', owner).kind, 'value', '기사 차량 지출이 있어도 저장소 형식 검사 통과')
  commitBatch([
    { domain: 'cars', ownerKey: owner, value: [] },
    { domain: 'clients', ownerKey: owner, value: [] },
    { domain: 'expenses', ownerKey: owner, value: [] },
  ], { persist: false, syncToCloud: false })
  initializeOwnerFromPersist(owner)
  const state = getState()
  assert.equal((state.cars[owner] || []).length, 2)
  assert.equal((state.clients[owner] || []).length, 1)
  const expenses = state.expenses[owner] || []
  assert.equal(expenses.length, 2)
  assert.equal(expenses.find((item) => item.kind === 'maint')?.vehicleNumber, '34나5678')
  assert.equal(expenses.find((item) => item.kind === 'fuel')?.vehicleNumber, undefined)
})

test('로드맵 25: 지출의 vehicleNumber가 글자가 아니면 지금처럼 형식 오류', () => {
  const owner = 'roundtrip-guest-bad-vehicle-number'
  localStorage.setItem(storageKeyFor('expenses', owner), JSON.stringify([{ id: 'e-1', kind: 'maint', date: '2026-10-09', cost: 1000, vehicleNumber: 3456 }]))
  assert.equal(readPersistDomain('expenses', owner).kind, 'schema')
})
