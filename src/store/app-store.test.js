// app-store.js가 (다른 모듈을 거쳐) supabaseClient.js를 임포트할 수 있다. 정적 import로 이 파일 맨 위에서 app-store.js를
// 끌어오면 mock.module()이 실행되기 전에 이미 모듈 그래프 전체가 링크돼 버려서 스텁이
// 안 먹는다(ESM은 최상위 정적 import를 전부 링크한 뒤에야 각 모듈의 본문을 실행한다) —
// 그래서 여기서도 cloudSync.test.js와 마찬가지로 mock.module 등록 뒤 동적 import를 쓴다.
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const {
  commitBatch,
  getState,
  setHydration,
  subscribe,
} = await import('./app-store.js')
const { commitCars, commitWorkData } = await import('./commitHelpers.js')
const { storageKeyFor } = await import('./persist.js')

function totalStubCalls() {
  return Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0)
}

describe('app-store — 초기 state 모양', () => {
  test('hydration은 idle로 시작하고 나머지 슬라이스는 빈 객체다', () => {
    const state = getState()
    assert.equal(state.hydration.status, 'idle')
    assert.equal(state.hydration.userId, null)
    for (const slice of ['workLogs', 'cars', 'clients', 'settings', 'expenses', 'driverExpenses', 'invoices', 'drivers', 'profile', 'dismissedNotifications']) {
      assert.ok(typeof state[slice] === 'object' && state[slice] !== null, `${slice} 슬라이스가 있어야 한다`)
    }
  })
})

describe('app-store — commitWorkData는 state.workData를 만들지 않는다', () => {
  test('workLogs[ownerKey].main에만 반영되고, state.workData는 여전히 undefined다', () => {
    const owner = 'commit-workdata-owner'
    commitWorkData(owner, { '2026-08-26': { isOff: false, fixedCount: 3 } })
    const state = getState()
    assert.deepEqual(state.workLogs[owner], { main: { '2026-08-26': { isOff: false, fixedCount: 3 } } })
    assert.equal(state.workData, undefined)
  })
})

describe('app-store — 커밋은 Supabase를 부르지 않는다', () => {
  test('커밋해도 hydration 상태는 그대로고, Supabase 호출은 0회다', () => {
    const owner = 'commit-nosync-owner'
    resetStubSupabaseCallCounts()
    setHydration({ status: 'idle', userId: null, ownerKey: null })
    commitCars(owner, [{ id: 'car-1', number: '12가3456' }])
    assert.deepEqual(getState().cars[owner], [{ id: 'car-1', number: '12가3456' }])
    // 감사 지적 9번: state만 보고 "동기화 안 했겠지"라고 넘기지 않는다 — 스텁 호출
    // 횟수를 직접 센다. idle이든 ready든 상관없이 0이어야 한다.
    assert.equal(totalStubCalls(), 0, '커밋은 Supabase 호출이 0회여야 한다')
  })
})

describe('app-store — subscribe/notify', () => {
  test('setHydration을 부르면 구독자가 최신 state를 받는다', () => {
    let received = null
    const unsubscribe = subscribe((state) => { received = state.hydration.status })
    setHydration({ status: 'hydrating', userId: 'u1', ownerKey: 'u1' })
    assert.equal(received, 'hydrating')
    unsubscribe()
    setHydration({ status: 'ready', userId: 'u1', ownerKey: 'u1' })
    assert.equal(received, 'hydrating', '구독 해제 후에는 더 안 불려야 한다')
  })
})

describe('app-store — commitBatch는 원자적이다(notify 정확히 한 번)', () => {
  test('여러 도메인을 한 번에 커밋해도 구독자는 notify를 정확히 한 번만 받고, 그때 모든 슬라이스가 이미 반영돼 있다', () => {
    const owner = 'commit-batch-owner'
    let notifyCount = 0
    let sawPartialState = false
    const unsubscribe = subscribe((state) => {
      notifyCount += 1
      // "완성된" state만 봐야 한다 — cars는 있는데 profile은 아직 없는 중간 상태를
      // 구독자가 보면 실패시킨다(예전엔 commit()을 슬라이스마다 따로 불러서 이게 가능했다).
      if (state.cars[owner] && !state.profile[owner]) sawPartialState = true
    })

    commitBatch([
      { domain: 'cars', ownerKey: owner, value: [{ id: 'batched-car' }] },
      { domain: 'profile', ownerKey: owner, value: { name: '배치 프로필' } },
      { domain: 'settings', ownerKey: owner, value: { theme: 'light' } },
    ])

    unsubscribe()
    assert.equal(notifyCount, 1, 'commitBatch는 항목 수와 상관없이 notify를 한 번만 불러야 한다')
    assert.equal(sawPartialState, false, '구독자가 절반만 반영된 중간 state를 보면 안 된다')
    assert.deepEqual(getState().cars[owner], [{ id: 'batched-car' }])
    assert.deepEqual(getState().profile[owner], { name: '배치 프로필' })
    assert.deepEqual(getState().settings[owner], { theme: 'light' })
  })
})

describe('commitBatch — 변경 기록장은 쓰지 않는다 (로드맵 89)', () => {
  test('비회원 저장 뒤 기록장 키가 생기지 않는다', () => {
    setHydration({ status: 'idle', userId: null, ownerKey: null })
    localStorage.removeItem('reactPracticeDirtyJournal:guest')
    commitCars('guest', [{ id: 'guest-car', number: '12가3456' }])
    assert.deepEqual(getState().cars.guest, [{ id: 'guest-car', number: '12가3456' }])
    assert.notEqual(localStorage.getItem(storageKeyFor('cars', 'guest')), null, '도메인 값은 저장된다')
    assert.equal(localStorage.getItem('reactPracticeDirtyJournal:guest'), null)
  })
})
