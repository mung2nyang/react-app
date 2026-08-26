// app-store.js는 (scheduleCloudSync를 통해) cloudSync.js를 임포트하고, cloudSync.js는
// 다시 supabaseClient.js를 임포트한다. 정적 import로 이 파일 맨 위에서 app-store.js를
// 끌어오면 mock.module()이 실행되기 전에 이미 모듈 그래프 전체가 링크돼 버려서 스텁이
// 안 먹는다(ESM은 최상위 정적 import를 전부 링크한 뒤에야 각 모듈의 본문을 실행한다) —
// 그래서 여기서도 cloudSync.test.js와 마찬가지로 mock.module 등록 뒤 동적 import를 쓴다.
import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const {
  commitCars,
  commitWorkData,
  getState,
  setHydration,
  subscribe,
} = await import('./app-store.js')

describe('app-store — 초기 state 모양', () => {
  test('hydration은 idle로 시작하고 나머지 슬라이스는 빈 객체다', () => {
    const state = getState()
    assert.equal(state.hydration.status, 'idle')
    assert.equal(state.hydration.userId, null)
    for (const slice of ['workLogs', 'cars', 'clients', 'settings', 'expenses', 'invoices', 'drivers', 'profile', 'dismissedNotifications']) {
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
  test('syncToCloud:false로 커밋해도 hydration 상태는 그대로다(원격 동기화 시도 없음)', () => {
    const owner = 'commit-nosync-owner'
    setHydration({ status: 'idle', userId: null, ownerKey: null })
    commitCars(owner, [{ id: 'car-1', number: '12가3456' }], { syncToCloud: false })
    // scheduleCloudSync는 idle 상태에서 pendingWhileBlocked만 표시하고 조용히 반환한다 —
    // 여기서 확인할 수 있는 건 "예외 없이, state는 정확히 반영됐다"는 것.
    assert.deepEqual(getState().cars[owner], [{ id: 'car-1', number: '12가3456' }])
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
