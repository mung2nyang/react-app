// owner-state.js → app-store.js → cloudSync.js → supabaseClient.js로 이어지는 정적 import
// 체인이 있어서, app-store.test.js와 같은 이유로 mock.module 등록 뒤 동적 import를 쓴다.
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

const { writeJsonKey } = await import('./persist.js')
const { getState } = await import('./app-store.js')
const { initializeOwnerFromPersist, replaceOwnerState } = await import('./owner-state.js')

function totalStubCalls() {
  return Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0)
}

describe('initializeOwnerFromPersist — persist에 있는 값을 읽기만 한다', () => {
  test('localStorage에 이미 있는 9개 도메인 값이 store에 그대로 반영된다', () => {
    const owner = 'init-owner'
    resetStubSupabaseCallCounts()
    writeJsonKey('cars', owner, [{ id: 'car-1' }])
    writeJsonKey('clients', owner, [{ id: 'client-1' }])
    writeJsonKey('settings', owner, { theme: 'dark' })
    writeJsonKey('profile', owner, { name: '홍길동' })
    writeJsonKey('workData', owner, { '2026-08-26': { isOff: true } })
    writeJsonKey('expenses', owner, [{ id: 'exp-1' }])
    writeJsonKey('invoices', owner, [{ id: 'inv-1' }])
    writeJsonKey('drivers', owner, [{ id: 'drv-1' }])
    writeJsonKey('dismissedNotifications', owner, ['n1'])

    initializeOwnerFromPersist(owner)

    const state = getState()
    assert.deepEqual(state.cars[owner], [{ id: 'car-1' }])
    assert.deepEqual(state.clients[owner], [{ id: 'client-1' }])
    assert.deepEqual(state.settings[owner], { theme: 'dark' })
    assert.deepEqual(state.profile[owner], { name: '홍길동' })
    assert.deepEqual(state.workLogs[owner], { main: { '2026-08-26': { isOff: true } } })
    assert.deepEqual(state.expenses[owner], [{ id: 'exp-1' }])
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
