import { resetStubSupabaseCallCounts, stubSupabaseCallCounts, stubSupabaseMethodImpls } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

const { commitCars } = await import('../store/commitHelpers.js')
const { getState, setHydration, subscribe } = await import('../store/app-store.js')
const { requestCarBusinessInfoSave } = await import('./vehicleMutations.js')
const { readJsonKey } = await import('../store/persist.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')

/** @type {import('../domain/carBusinessInfo.js').CarBusinessForm} */
const FORM = {
  sameAsOwner: false,
  name: '한빛운수',
  bizNumber: '123-45-67890',
  representative: '김대표',
  address: '서울시 강서구 1',
  bizType: '운수업',
  bizItem: '화물운송',
  email: 'tax@hanbit.kr',
  bank: '국민은행',
  account: '111-222-333',
  accountHolder: '김기사',
}

/** @type {import('../domain/financeTypes.js').CarLike} */
const SUB = { id: 'sub-1', type: 'sub', number: '11가1111', driverName: '김기사', supabaseId: 7, personalInfo: { driverName: '김기사', phone: '010-1111-2222' } }
/** @type {import('../domain/financeTypes.js').CarLike} */
const MAIN = { id: 'main-1', type: 'main', number: '22나2222', supabaseId: 8 }

/** @param {string} owner @param {string} id */
function carOf(owner, id) {
  const car = getState().cars[owner].find((item) => item.id === id)
  assert.ok(car, id)
  return car
}

describe('requestCarBusinessInfoSave', () => {
  test('게스트: Store와 localStorage에 저장되고 서버 호출은 없다', async () => {
    endCloudSession()
    const owner = 'biz-guest'
    commitCars(owner, [MAIN, SUB], { syncToCloud: false })
    resetStubSupabaseCallCounts()
    const result = await requestCarBusinessInfoSave({ ownerKey: owner, userId: null, cars: getState().cars[owner], carId: 'sub-1', form: FORM })
    assert.equal(result.failed, false)
    assert.equal(result.toast, '저장했습니다.')
    const saved = carOf(owner, 'sub-1')
    assert.equal(saved.businessInfo?.name, '한빛운수')
    assert.equal(saved.personalInfo?.bank, '국민은행')
    assert.equal(saved.personalInfo?.phone, '010-1111-2222')
    assert.equal(carOf(owner, 'main-1').businessInfo, undefined)
    const persisted = readJsonKey('cars', owner, /** @type {Array<{ id: string, businessInfo?: { name?: string } }>} */ ([]))
    assert.equal(persisted.find((car) => car.id === 'sub-1')?.businessInfo?.name, '한빛운수')
    assert.equal(Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0), 0)
  })

  test('로그인+ready: 서버 update 1회 후 Store 반영', async () => {
    const owner = 'biz-cloud-ok'
    resetStubSupabaseCallCounts()
    beginSessionEpoch('user-biz1', owner)
    setHydration({ status: 'ready', userId: 'user-biz1', ownerKey: owner })
    commitCars(owner, [MAIN, SUB], { syncToCloud: false })
    try {
      const result = await requestCarBusinessInfoSave({ ownerKey: owner, userId: 'user-biz1', cars: getState().cars[owner], carId: 'sub-1', form: FORM })
      assert.equal(result.failed, false)
      assert.equal(stubSupabaseCallCounts.update, 1)
      assert.equal(carOf(owner, 'sub-1').businessInfo?.bizNumber, '123-45-67890')
    } finally {
      resetStubSupabaseCallCounts()
      endCloudSession()
    }
  })

  test('서버 실패(throw·{data:null,error})면 실패 토스트, Store·localStorage·알림 횟수 불변', async () => {
    const owner = 'biz-cloud-fail'
    beginSessionEpoch('user-biz2', owner)
    setHydration({ status: 'ready', userId: 'user-biz2', ownerKey: owner })
    commitCars(owner, [MAIN, SUB], { syncToCloud: false })
    const before = JSON.stringify(getState().cars[owner])
    const lsBefore = JSON.stringify(readJsonKey('cars', owner, []))
    const errSpy = mock.method(console, 'error', () => {})
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    try {
      for (const impl of [
        async () => { throw new Error('network down') },
        async () => ({ data: null, error: { message: 'RLS' } }),
      ]) {
        stubSupabaseMethodImpls.update = impl
        const result = await requestCarBusinessInfoSave({ ownerKey: owner, userId: 'user-biz2', cars: getState().cars[owner], carId: 'sub-1', form: FORM })
        assert.equal(result.failed, true)
        assert.equal(result.toast, '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
        assert.equal(JSON.stringify(getState().cars[owner]), before)
        assert.equal(JSON.stringify(readJsonKey('cars', owner, [])), lsBefore)
      }
      assert.equal(notifyCount, 0)
    } finally {
      unsubscribe()
      errSpy.mock.restore()
      resetStubSupabaseCallCounts()
      endCloudSession()
    }
  })

  test('hydration failed면 서버 호출 0회, Store 불변', async () => {
    const owner = 'biz-hyd-fail'
    resetStubSupabaseCallCounts()
    beginSessionEpoch('user-biz3', owner)
    setHydration({ status: 'failed', userId: 'user-biz3', ownerKey: owner })
    commitCars(owner, [MAIN, SUB], { syncToCloud: false })
    const before = JSON.stringify(getState().cars[owner])
    try {
      const result = await requestCarBusinessInfoSave({ ownerKey: owner, userId: 'user-biz3', cars: getState().cars[owner], carId: 'sub-1', form: FORM })
      assert.equal(result.failed, true)
      assert.equal(Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0), 0)
      assert.equal(JSON.stringify(getState().cars[owner]), before)
    } finally {
      endCloudSession()
    }
  })

  test('메인 차량이나 없는 차량은 저장하지 않는다', async () => {
    endCloudSession()
    const owner = 'biz-not-sub'
    commitCars(owner, [MAIN, SUB], { syncToCloud: false })
    const before = JSON.stringify(getState().cars[owner])
    for (const carId of ['main-1', 'nope']) {
      const result = await requestCarBusinessInfoSave({ ownerKey: owner, userId: null, cars: getState().cars[owner], carId, form: FORM })
      assert.equal(result.failed, true)
      assert.equal(JSON.stringify(getState().cars[owner]), before)
    }
  })
})
