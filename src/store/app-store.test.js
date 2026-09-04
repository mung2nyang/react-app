// app-store.js는 (scheduleCloudSync를 통해) cloudSync.js를 임포트하고, cloudSync.js는
// 다시 supabaseClient.js를 임포트한다. 정적 import로 이 파일 맨 위에서 app-store.js를
// 끌어오면 mock.module()이 실행되기 전에 이미 모듈 그래프 전체가 링크돼 버려서 스텁이
// 안 먹는다(ESM은 최상위 정적 import를 전부 링크한 뒤에야 각 모듈의 본문을 실행한다) —
// 그래서 여기서도 cloudSync.test.js와 마찬가지로 mock.module 등록 뒤 동적 import를 쓴다.
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

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

// Storage 전역 이름에 기대지 않고 프로토타입에서 원본 setItem을 직접 캡처한다.
function withFailingSetItem(shouldFail, fn) {
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', function patchedSetItem(key, value) {
    if (shouldFail(key)) throw new Error('quota exceeded (simulated)')
    return original.call(this, key, value)
  })
  try {
    fn()
  } finally {
    spy.mock.restore()
  }
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

describe('app-store — commit* options.syncToCloud:false는 예약을 건너뛴다', () => {
  test('syncToCloud:false로 커밋해도 hydration 상태는 그대로고, Supabase 호출은 0회다', () => {
    const owner = 'commit-nosync-owner'
    resetStubSupabaseCallCounts()
    setHydration({ status: 'idle', userId: null, ownerKey: null })
    commitCars(owner, [{ id: 'car-1', number: '12가3456' }], { syncToCloud: false })
    assert.deepEqual(getState().cars[owner], [{ id: 'car-1', number: '12가3456' }])
    // 감사 지적 9번: state만 보고 "동기화 안 했겠지"라고 넘기지 않는다 — 스텁 호출
    // 횟수를 직접 센다. syncToCloud:false는 scheduleCloudSync() 자체를 안 부르므로
    // idle이든 ready든 상관없이 0이어야 한다.
    assert.equal(totalStubCalls(), 0, 'syncToCloud:false면 Supabase 호출이 0회여야 한다')
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
    ], { persist: true, syncToCloud: false })

    unsubscribe()
    assert.equal(notifyCount, 1, 'commitBatch는 항목 수와 상관없이 notify를 한 번만 불러야 한다')
    assert.equal(sawPartialState, false, '구독자가 절반만 반영된 중간 state를 보면 안 된다')
    assert.deepEqual(getState().cars[owner], [{ id: 'batched-car' }])
    assert.deepEqual(getState().profile[owner], { name: '배치 프로필' })
    assert.deepEqual(getState().settings[owner], { theme: 'light' })
  })
})

describe('commitBatch — dirty journal 쓰기 실패는 도메인/journal/state/notify/Supabase 전부 그대로 둔다', () => {
  test('journal localStorage.setItem이 quota 초과로 던지면 아무것도 반영되지 않는다', () => {
    const owner = 'commit-journal-quota'
    const journalKey = `reactPracticeDirtyJournal:${owner}`

    // 1) 정상 커밋으로 "실패 전 상태"를 만든다 — journal도 { cars: 1 }로 이미 한 번 쓰였다.
    commitCars(owner, [{ id: 'original-car' }])
    const carsRawBefore = localStorage.getItem(storageKeyFor('cars', owner))
    const journalRawBefore = localStorage.getItem(journalKey)
    const stateBefore = getState().cars[owner]

    resetStubSupabaseCallCounts()
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })

    withFailingSetItem((key) => key === journalKey, () => {
      assert.throws(
        () => commitCars(owner, [{ id: 'should-not-land' }]),
        /quota exceeded/,
      )
    })
    unsubscribe()

    assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), carsRawBefore, '도메인(cars) localStorage가 원래 값으로 롤백돼야 한다')
    assert.equal(localStorage.getItem(journalKey), journalRawBefore, 'journal localStorage도 원래 값 그대로여야 한다(실패한 키라 애초에 안 바뀐다)')
    assert.deepEqual(getState().cars[owner], stateBefore, 'store state는 그대로여야 한다 — writeAllOrNothing이 던지면 applyDomainToState는 아예 안 불린다')
    assert.equal(notifyCount, 0, 'notify가 호출되면 안 된다')
    assert.equal(totalStubCalls(), 0, 'Supabase 호출이 있으면 안 된다(notify가 없으니 scheduleCloudSync도 안 불린다)')
  })
})
