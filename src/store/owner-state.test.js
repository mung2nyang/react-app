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

  // Step 7 후속 재감사 — 위 최소 row(raw:{})는 `...raw` 스프레드가 있던 예전 코드에서도
  // 통과했다(라 추가할 게 없어서). 아래 3개는 raw에 "정본 밖/잘못된" 값이 실제로 섞인
  // 경우라 예전 코드였다면 hydrate 직후 persist는 됐어도 이 initialize 왕복에서
  // cars/clients 도메인 전체가 schema 실패로 사라졌을 시나리오다(감지력 확인: 이 3개
  // 테스트는 hydrateMergeCars.js/hydrateMergeClients.js의 `...raw`를 되돌리면 실패한다 —
  // 되돌려서 확인 후 복원함).
  test('바닐라 personalInfo(phone/bank/account/accountHolder) raw는 initialize 왕복 후 보존된다', async () => {
    const { mergeCarsFromRows } = await import('../lib/hydrateMerge.js')
    const { readPersistDomain } = await import('./persistDomainRead.js')
    const { commitBatch } = await import('./app-store.js')
    const owner = 'hydrate-personalinfo-roundtrip'
    resetStubSupabaseCallCounts()
    const merged = mergeCarsFromRows([], [{
      id: 601,
      number: '22나2222',
      type: 'sub',
      raw: {
        personalInfo: {
          driverName: '김기사', name: '김기사', bizNumber: '111-11-11111',
          phone: '010-1234-5678', bank: '국민은행', account: '123-456-789', accountHolder: '김기사',
        },
      },
    }])
    assert.equal(merged[0].personalInfo?.phone, '010-1234-5678')
    replaceOwnerState(owner, { cars: merged }, { sync: false })
    assert.equal(readPersistDomain('cars', owner).kind, 'value')
    commitBatch([{ domain: 'cars', ownerKey: owner, value: [] }], { persist: false, syncToCloud: false })
    assert.equal(getState().cars[owner]?.length, 0)
    initializeOwnerFromPersist(owner)
    assert.equal(readPersistDomain('cars', owner).kind, 'value')
    const info = getState().cars[owner]?.[0]?.personalInfo
    assert.equal(info?.driverName, '김기사')
    assert.equal(info?.bizNumber, '111-11-11111')
    assert.equal(info?.phone, '010-1234-5678')
    assert.equal(info?.bank, '국민은행')
    assert.equal(info?.account, '123-456-789')
    assert.equal(info?.accountHolder, '김기사')
    assert.equal(totalStubCalls(), 0)
  })

  test('raw.settlementMode가 bogus면 정규화돼 initialize가 성공하지만, 검증기에 bogus를 직접 넣으면 여전히 schema 실패다', async () => {
    const { mergeCarsFromRows } = await import('../lib/hydrateMerge.js')
    const { readPersistDomain } = await import('./persistDomainRead.js')
    const { commitBatch } = await import('./app-store.js')
    const owner = 'hydrate-bogus-enum'
    resetStubSupabaseCallCounts()
    const merged = mergeCarsFromRows([], [{ id: 701, number: '33다3333', type: 'main', raw: { settlementMode: 'bogus' } }])
    // producer는 persist 불가 값을 canonical 기본값으로 정규화한다(검증기를 느슨하게
    // 만드는 게 아니라 producer가 스키마를 맞춘다).
    assert.equal(merged[0].settlementMode, 'default')
    replaceOwnerState(owner, { cars: merged }, { sync: false })
    assert.equal(readPersistDomain('cars', owner).kind, 'value')
    commitBatch([{ domain: 'cars', ownerKey: owner, value: [] }], { persist: false, syncToCloud: false })
    initializeOwnerFromPersist(owner)
    assert.equal(getState().cars[owner]?.[0]?.settlementMode, 'default')
    assert.equal(totalStubCalls(), 0)

    // 검증기(isPersistedCar) 자체는 그대로다 — 'bogus'가 직접 저장돼 있으면 여전히
    // 거부하고, 그 실패는 Store/원문/notify를 하나도 건드리지 않는다.
    const beforeCarsState = JSON.stringify(getState().cars[owner])
    localStorage.setItem(storageKeyFor('cars', owner), JSON.stringify([{ number: '33다3333', settlementMode: 'bogus' }]))
    let notifyCount = 0
    const unsub = subscribe(() => { notifyCount += 1 })
    initializeOwnerFromPersist(owner)
    unsub()
    assert.equal(readPersistDomain('cars', owner).kind, 'schema')
    assert.equal(notifyCount, 0)
    assert.equal(JSON.stringify(getState().cars[owner]), beforeCarsState)
    assert.equal(totalStubCalls(), 0)
  })

  test('거래처 raw에 정본 밖 extra 키가 섞여도 persist 가능한 거래처 1건으로 정규화되고 extra 키는 없다', async () => {
    const { mergeClientsFromRows } = await import('../lib/hydrateMerge.js')
    const { readPersistDomain } = await import('./persistDomainRead.js')
    const { commitBatch } = await import('./app-store.js')
    const owner = 'hydrate-client-extra-key'
    resetStubSupabaseCallCounts()
    // raw는 실제 Supabase JSONB(정본 밖 키가 실제로 섞일 수 있는 "미확인 JSON")라
    // JsonRecord로 별도 선언한다 — ClientRow.raw의 선언 타입(RawClientBackup =
    // Partial<ClientLike>)에 정본 밖 키를 인라인 리터럴로 바로 넣으면 TS의 신선한
    // 객체 리터럴 초과 프로퍼티 검사에 걸린다(런타임 안전성과는 무관한 검사다).
    /** @type {import('../lib/pendingWorkDataWritesTypes.js').JsonRecord} */
    const rawWithExtraKey = { managerName: '박담당', phone: '010-9999-8888', extraFromVanilla: '레거시전용필드' }
    const merged = mergeClientsFromRows([], [{
      id: 801,
      company_name: '한진',
      legacy_client_id: 'client-1',
      raw: rawWithExtraKey,
    }])
    assert.equal(merged.length, 1)
    assert.equal('extraFromVanilla' in merged[0], false)
    assert.equal(merged[0].managerName, '박담당')
    replaceOwnerState(owner, { clients: merged }, { sync: false })
    assert.equal(readPersistDomain('clients', owner).kind, 'value')
    commitBatch([{ domain: 'clients', ownerKey: owner, value: [] }], { persist: false, syncToCloud: false })
    assert.equal(getState().clients[owner]?.length, 0)
    initializeOwnerFromPersist(owner)
    assert.equal(readPersistDomain('clients', owner).kind, 'value')
    assert.equal(getState().clients[owner]?.length, 1)
    assert.equal(getState().clients[owner]?.[0]?.managerName, '박담당')
    assert.equal(getState().clients[owner]?.[0]?.phone, '010-9999-8888')
    assert.equal('extraFromVanilla' in (getState().clients[owner]?.[0] || {}), false)
    assert.equal(totalStubCalls(), 0)
  })

  // 재감사(불리언 기본값) — insuranceOn/logEnabled/driverLinkEnabled/
  // shareRevenueWithOwner/archived를 boolOrFalse로 채우면 "없음"과 "명시적 false"가
  // 구분 안 돼, shareRevenueWithOwner처럼 "없음 = true(공유)"인 필드가 hydrate 왕복
  // 한 번으로 전부 false(비공유)가 돼 버린다(감지력: 아래 3개는 hydrateMergeCars.js의
  // boolOrOmit을 boolOrFalse로 되돌리면 실패한다 — 되돌려서 확인 후 복원함).
  test('raw:{}인 최소 row는 shareRevenueWithOwner 키가 없고, 소비 쪽 기본값(공유)으로 읽힌다', async () => {
    const { mergeCarsFromRows } = await import('../lib/hydrateMerge.js')
    const { readPersistDomain } = await import('./persistDomainRead.js')
    const { commitBatch } = await import('./app-store.js')
    const { isVehicleRevenueSharedWithOwner } = await import('../domain/cars.js')
    const owner = 'hydrate-share-default'
    resetStubSupabaseCallCounts()
    const merged = mergeCarsFromRows([], [{ id: 901, number: '44라4444', type: 'sub', raw: {} }])
    assert.equal('shareRevenueWithOwner' in merged[0], false)
    assert.equal(isVehicleRevenueSharedWithOwner(merged[0]), true)
    replaceOwnerState(owner, { cars: merged }, { sync: false })
    assert.equal(readPersistDomain('cars', owner).kind, 'value')
    commitBatch([{ domain: 'cars', ownerKey: owner, value: [] }], { persist: false, syncToCloud: false })
    assert.equal(getState().cars[owner]?.length, 0)
    initializeOwnerFromPersist(owner)
    assert.equal(readPersistDomain('cars', owner).kind, 'value')
    const car = getState().cars[owner]?.[0]
    assert.equal('shareRevenueWithOwner' in (car || {}), false)
    assert.equal(isVehicleRevenueSharedWithOwner(car), true)
    assert.equal(totalStubCalls(), 0)
  })

  test('raw.shareRevenueWithOwner:false는 정규화·왕복 후에도 false로 남는다', async () => {
    const { mergeCarsFromRows } = await import('../lib/hydrateMerge.js')
    const { commitBatch } = await import('./app-store.js')
    const { isVehicleRevenueSharedWithOwner } = await import('../domain/cars.js')
    const owner = 'hydrate-share-false'
    resetStubSupabaseCallCounts()
    const merged = mergeCarsFromRows([], [{ id: 902, number: '55마5555', type: 'sub', raw: { shareRevenueWithOwner: false } }])
    assert.equal(merged[0].shareRevenueWithOwner, false)
    replaceOwnerState(owner, { cars: merged }, { sync: false })
    commitBatch([{ domain: 'cars', ownerKey: owner, value: [] }], { persist: false, syncToCloud: false })
    initializeOwnerFromPersist(owner)
    const car = getState().cars[owner]?.[0]
    assert.equal(car?.shareRevenueWithOwner, false)
    assert.equal(isVehicleRevenueSharedWithOwner(car), false)
    assert.equal(totalStubCalls(), 0)
  })

  test('React upsertCar가 실제로 저장하는 모양(불리언 필드 없음)도 hydrate 왕복 후 공유가 true로 유지된다', async () => {
    const { mergeCarsFromRows } = await import('../lib/hydrateMerge.js')
    const { commitBatch } = await import('./app-store.js')
    const { upsertCar, isVehicleRevenueSharedWithOwner } = await import('../domain/cars.js')
    const owner = 'hydrate-share-upsertcar-shape'
    resetStubSupabaseCallCounts()
    const { cars, error } = upsertCar([], { number: '66바6666', type: 'sub', driverName: '이기사', driverPhone: '010-2222-3333' })
    assert.equal(error, undefined)
    assert.equal('shareRevenueWithOwner' in cars[0], false)
    const merged = mergeCarsFromRows([], [{ id: 903, number: '66바6666', type: 'sub', raw: cars[0] }])
    assert.equal(isVehicleRevenueSharedWithOwner(merged[0]), true)
    replaceOwnerState(owner, { cars: merged }, { sync: false })
    commitBatch([{ domain: 'cars', ownerKey: owner, value: [] }], { persist: false, syncToCloud: false })
    initializeOwnerFromPersist(owner)
    const car = getState().cars[owner]?.[0]
    assert.equal(isVehicleRevenueSharedWithOwner(car), true)
    assert.equal(totalStubCalls(), 0)
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
