// owner-state.js → app-store.js → cloudSync.js → supabaseClient.js로 이어지는 정적 import
// 체인이 있어서, app-store.test.js와 같은 이유로 mock.module 등록 뒤 동적 import를 쓴다.
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const { writeJsonKey, storageKeyFor, storageKeyForLog } = await import('./persist.js')
const { getState, subscribe } = await import('./app-store.js')
const { initializeOwnerFromPersist, replaceOwnerState } = await import('./owner-state.js')
const { commitCars, commitLogWorkData } = await import('./commitHelpers.js')

function totalStubCalls() {
  return Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0)
}

describe('initializeOwnerFromPersist — persist에 있는 값을 읽기만 한다', () => {
  test('이 함수는 Supabase hydrate가 아니다 — 원격 호출 0회', () => {
    const owner = 'init-owner-not-hydrate'
    resetStubSupabaseCallCounts()
    writeJsonKey('cars', owner, [{ id: 'car-persist-only', number: '00가0000' }])
    initializeOwnerFromPersist(owner)
    assert.equal(getState().cars[owner]?.[0]?.id, 'car-persist-only')
    assert.equal(totalStubCalls(), 0)
  })
  test('localStorage에 이미 있는 9개 도메인 값이 store에 그대로 반영된다', () => {
    const owner = 'init-owner'
    resetStubSupabaseCallCounts()
    writeJsonKey('cars', owner, [{ id: 'car-1', number: '11가1111' }])
    writeJsonKey('clients', owner, [{ id: 'client-1', companyName: '한진' }])
    writeJsonKey('settings', owner, { theme: 'dark' })
    writeJsonKey('profile', owner, { name: '홍길동' })
    writeJsonKey('workData', owner, { '2026-08-26': { isOff: true } })
    writeJsonKey('expenses', owner, [{ id: 'exp-1', kind: 'misc', date: '2026-08-26' }])
    writeJsonKey('invoices', owner, [{ id: 'inv-1' }])
    writeJsonKey('drivers', owner, [{ id: 'drv-1' }])
    writeJsonKey('dismissedNotifications', owner, ['n1'])

    initializeOwnerFromPersist(owner)

    const state = getState()
    assert.deepEqual(state.cars[owner], [{ id: 'car-1', number: '11가1111' }])
    assert.deepEqual(state.clients[owner], [{ id: 'client-1', companyName: '한진' }])
    assert.deepEqual(state.settings[owner], { theme: 'dark' })
    assert.deepEqual(state.profile[owner], { name: '홍길동' })
    assert.deepEqual(state.workLogs[owner], { main: { '2026-08-26': { isOff: true } } })
    assert.deepEqual(state.expenses[owner], [{ id: 'exp-1', kind: 'misc', date: '2026-08-26' }])
    assert.deepEqual(state.invoices[owner], [{ id: 'inv-1' }])
    assert.deepEqual(state.drivers[owner], [{ id: 'drv-1' }])
    assert.deepEqual(state.dismissedNotifications[owner], ['n1'])
    assert.equal(totalStubCalls(), 0, 'persist에서 읽어 store만 채우는 초기화는 Supabase를 전혀 부르면 안 된다')
  })

  test('아무것도 저장된 적 없는 owner는 빈 배열/객체로 채워진다(형태가 깨지지 않는다)', () => {
    const owner = 'init-owner-empty'
    initializeOwnerFromPersist(owner)
    const state = getState()
    assert.deepEqual(state.cars[owner], [])
    assert.deepEqual(state.settings[owner], {})
    assert.deepEqual(state.workLogs[owner], { main: {} })
  })

  test('번호 변경 persist 뒤 initialize는 메모리의 옛 서브 로그를 버린다', () => {
    const owner = 'init-stale-sub-log'
    const oldNum = '11가1111'
    const newNum = '22나2222'
    commitCars(owner, [{ id: 'c1', type: 'sub', number: oldNum }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { '2026-08-01': { isOff: false, fixedCount: 2 } })
    writeJsonKey('cars', owner, [{ id: 'c1', type: 'sub', number: newNum }])
    localStorage.setItem(storageKeyForLog(owner, newNum), JSON.stringify({ '2026-08-01': { isOff: false, fixedCount: 9 } }))
    localStorage.removeItem(storageKeyForLog(owner, oldNum))
    initializeOwnerFromPersist(owner)
    assert.equal(getState().cars[owner][0].number, newNum)
    assert.equal(getState().workLogs[owner][oldNum], undefined)
    assert.equal(getState().workLogs[owner][newNum]['2026-08-01'].fixedCount, 9)
    assert.equal(totalStubCalls(), 0)
  })

  test('서브 일지 읽기 실패면 persist 초기화를 중단하고 Store를 유지한다', () => {
    const owner = 'init-log-schema-fail'
    commitCars(owner, [{ id: 'c1', type: 'sub', number: '33다3333' }], { syncToCloud: false })
    commitLogWorkData(owner, '33다3333', { '2026-08-02': { isOff: false, fixedCount: 4 } })
    writeJsonKey('cars', owner, [{ id: 'c1', type: 'sub', number: '33다3333' }])
    localStorage.setItem(storageKeyForLog(owner, '33다3333'), '[]')
    const carsSnap = JSON.stringify(getState().cars[owner])
    const logsSnap = JSON.stringify(getState().workLogs[owner])
    initializeOwnerFromPersist(owner)
    assert.equal(JSON.stringify(getState().cars[owner]), carsSnap)
    assert.equal(JSON.stringify(getState().workLogs[owner]), logsSnap)
    assert.equal(totalStubCalls(), 0)
  })

  test('cars 또는 clients JSON이 손상되면 Store와 모든 원문을 유지한다', () => {
    const owner = 'init-cars-corrupt'
    writeJsonKey('cars', owner, [{ id: 'keep-car', number: '10가1000' }])
    writeJsonKey('clients', owner, [{ id: 'keep-cli', companyName: '유지' }])
    writeJsonKey('workData', owner, { '2026-08-01': { isOff: true } })
    initializeOwnerFromPersist(owner)
    const carsSnap = JSON.stringify(getState().cars[owner])
    const clientsSnap = JSON.stringify(getState().clients[owner])
    const logsSnap = JSON.stringify(getState().workLogs[owner])
    const originals = {
      cars: localStorage.getItem(storageKeyFor('cars', owner)),
      clients: localStorage.getItem(storageKeyFor('clients', owner)),
      workData: localStorage.getItem(storageKeyFor('workData', owner)),
    }
    localStorage.setItem(storageKeyFor('cars', owner), '{not-json')
    let notifyCount = 0
    const unsub = subscribe(() => { notifyCount += 1 })
    initializeOwnerFromPersist(owner)
    unsub()
    assert.equal(notifyCount, 0)
    assert.equal(JSON.stringify(getState().cars[owner]), carsSnap)
    assert.equal(JSON.stringify(getState().clients[owner]), clientsSnap)
    assert.equal(JSON.stringify(getState().workLogs[owner]), logsSnap)
    assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), '{not-json')
    assert.equal(localStorage.getItem(storageKeyFor('clients', owner)), originals.clients)
    assert.equal(localStorage.getItem(storageKeyFor('workData', owner)), originals.workData)

    localStorage.setItem(storageKeyFor('cars', owner), originals.cars)
    initializeOwnerFromPersist(owner)
    localStorage.setItem(storageKeyFor('clients', owner), '[1]')
    notifyCount = 0
    const unsub2 = subscribe(() => { notifyCount += 1 })
    const cars2 = JSON.stringify(getState().cars[owner])
    initializeOwnerFromPersist(owner)
    unsub2()
    assert.equal(notifyCount, 0)
    assert.equal(JSON.stringify(getState().cars[owner]), cars2)
    assert.equal(localStorage.getItem(storageKeyFor('clients', owner)), '[1]')
    assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), originals.cars)
  })
})

describe('replaceOwnerState — sync:false는 클라우드 동기화를 예약하지 않는다', () => {
  test('스냅샷을 store와 localStorage에 반영하되, 원격 쓰기 핑퐁은 안 만든다', () => {
    const owner = 'replace-owner'
    resetStubSupabaseCallCounts()
    replaceOwnerState(owner, {
      cars: [{ id: 'car-server' }],
      profile: { name: '서버값' },
      workData: { '2026-08-01': { isOff: false } },
    }, { sync: false })

    const state = getState()
    assert.deepEqual(state.cars[owner], [{ id: 'car-server' }])
    assert.deepEqual(state.profile[owner], { name: '서버값' })
    assert.deepEqual(state.workLogs[owner], { main: { '2026-08-01': { isOff: false } } })
    // 감사 지적 9번: state만 보고 "동기화 안 했겠지"라고 넘기지 않는다 — 실제로 supabase
    // 스텁이 몇 번 불렸는지 직접 센다.
    assert.equal(totalStubCalls(), 0, 'sync:false면 Supabase 호출이 0회여야 한다')
  })

  test('스냅샷에 없는 필드는 손대지 않는다(부분 스냅샷도 안전)', () => {
    const owner = 'replace-owner-partial'
    replaceOwnerState(owner, { cars: [{ id: 'only-cars' }] }, { sync: false })
    const state = getState()
    assert.deepEqual(state.cars[owner], [{ id: 'only-cars' }])
    assert.equal(state.profile[owner], undefined)
  })
})

describe('hydrate 산출물 → persist → fresh initialize 왕복', () => {
  test('최소 차량 row는 replace 후 initialize에서도 supabaseId가 남는다', async () => {
    const { mergeCarsFromRows } = await import('../lib/hydrateMerge.js')
    const { readPersistDomain } = await import('./persistDomainRead.js')
    const { commitBatch } = await import('./app-store.js')
    const owner = 'hydrate-car-roundtrip'
    resetStubSupabaseCallCounts()
    const merged = mergeCarsFromRows([], [{ id: 501, number: '11가1111', type: 'main', raw: {} }])
    replaceOwnerState(owner, { cars: merged }, { sync: false })
    assert.equal(readPersistDomain('cars', owner).kind, 'value')
    commitBatch([{ domain: 'cars', ownerKey: owner, value: [] }], { persist: false, syncToCloud: false })
    assert.equal(getState().cars[owner]?.length, 0)
    initializeOwnerFromPersist(owner)
    assert.equal(getState().cars[owner]?.[0]?.number, '11가1111')
    assert.equal(getState().cars[owner]?.[0]?.supabaseId, 501)
    assert.equal(getState().cars[owner]?.[0]?.settlementMode, 'default')
  })

  test('hydrate 비용 임베드와 expenses는 initialize 뒤 유실·중복 0건이다', async () => {
    const { mergeWorkDataFromRows } = await import('../lib/hydrateMerge.js')
    const { expenseFromFuelRecord, replaceFuelExpenses } = await import('../domain/fuelRecords.js')
    const { readPersistDomain } = await import('./persistDomainRead.js')
    const { readLogWorkData } = await import('./persist.js')
    const { commitBatch } = await import('./app-store.js')
    const owner = 'hydrate-exp-roundtrip'
    resetStubSupabaseCallCounts()
    const fuelRaw = { type: '주유', cost: '80,000', subsidy: '5,000', liter: 40 }
    const maintRaw = { name: '오일', fare: '30,000' }
    const miscRaw = { name: '통행료', fare: '8,000' }
    const workData = mergeWorkDataFromRows({}, {
      dailyRows: [{ work_date: '2026-08-01', is_off: false, fixed_count: 1, raw: {} }],
      transportRows: [{ work_date: '2026-08-01', raw: { loadLoc: '상차', fare: 10000 } }],
      fuelRows: [{ work_date: '2026-08-01', raw: fuelRaw }],
      maintRows: [{ work_date: '2026-08-01', raw: maintRaw }],
      miscRows: [{ work_date: '2026-08-01', raw: miscRaw }],
    })
    const expenses = replaceFuelExpenses([], [expenseFromFuelRecord({ work_date: '2026-08-01', raw: fuelRaw })])
    replaceOwnerState(owner, { workData, expenses }, { sync: false })
    assert.equal(readLogWorkData(owner, 'main').kind, 'value')
    assert.equal(readPersistDomain('expenses', owner).kind, 'value')
    const day = getState().workLogs[owner]?.main?.['2026-08-01']
    assert.equal(day?.fuelItems, undefined)
    assert.equal(day?.maintItems, undefined)
    assert.equal(day?.miscItems, undefined)
    assert.equal(getState().expenses[owner]?.filter((/** @type {{ kind: string }} */ item) => item.kind === 'fuel').length, 1)
    commitBatch([
      { domain: 'workData', ownerKey: owner, value: {} },
      { domain: 'expenses', ownerKey: owner, value: [] },
    ], { persist: false, syncToCloud: false, replaceWorkLogs: { ownerKey: owner, next: { main: {} } } })
    initializeOwnerFromPersist(owner)
    const afterDay = getState().workLogs[owner]?.main?.['2026-08-01']
    assert.equal(afterDay?.fuelItems, undefined)
    assert.equal(afterDay?.maintItems, undefined)
    assert.equal(afterDay?.miscItems, undefined)
    assert.equal(afterDay?.callDetails?.[0]?.loadLoc, '상차')
    assert.equal(getState().expenses[owner]?.filter((/** @type {{ kind: string }} */ item) => item.kind === 'fuel').length, 1)
    assert.equal(getState().expenses[owner]?.length, 1)
  })
})
