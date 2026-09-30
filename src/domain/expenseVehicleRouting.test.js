// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isLinkedPlate, planExpenseVehicleTargets } from './expenseVehicleRouting.js'

/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */

/** @type {import('./financeTypes.js').CarLike} */
const MAIN = { id: 'c-main', type: 'main', number: '11가1111', supabaseId: 501 }
/** @type {import('./financeTypes.js').CarLike} */
const SUB = { id: 'c-sub', type: 'sub', number: '22나2222', supabaseId: 802 }
/** @type {import('./financeTypes.js').CarLike} */
const SUB_LOCAL_ONLY = { id: 'c-sub2', type: 'sub', number: '33다3333' }

/** @param {string} id @param {string} date @param {string} [vehicleNumber] @returns {ExpenseItem} */
function fuel(id, date, vehicleNumber) {
  return { id, kind: 'fuel', date, cost: 1000, vehicleNumber }
}

describe('isLinkedPlate', () => {
  test('linked 기사만 연동으로 본다(초대 대기는 미연동)', () => {
    assert.equal(isLinkedPlate('22나2222', [{ id: 'd1', status: 'linked', vehicleNumber: '22나2222' }]), true)
    assert.equal(isLinkedPlate('22나2222', [{ id: 'd1', status: 'pending', vehicleNumber: '22나2222' }]), false)
    assert.equal(isLinkedPlate('22나2222', [{ id: 'd1', status: 'linked', vehicleNumber: '99하9999' }]), false)
    assert.equal(isLinkedPlate('', [{ id: 'd1', status: 'linked', vehicleNumber: '' }]), false)
  })
})

describe('planExpenseVehicleTargets — 로드맵 5-A', () => {
  test('표시 없음 → 메인, 미연동 서브 표시 → 서브 칸(앞), 메인 칸은 옮긴 날짜를 정리 대상으로 받는다', () => {
    const targets = planExpenseVehicleTargets([MAIN, SUB], [], [
      fuel('m1', '2026-08-01'),
      fuel('s1', '2026-08-03', '22나2222'),
    ])
    assert.equal(targets.length, 2)
    assert.equal(targets[0].vehicleId, 802)
    assert.equal(targets[0].logId, '22나2222')
    assert.deepEqual(targets[0].expenses.map((item) => item.id), ['s1'])
    assert.deepEqual(targets[0].cleanupDates, [])
    assert.equal(targets[1].vehicleId, 501)
    assert.equal(targets[1].logId, 'main')
    assert.deepEqual(targets[1].expenses.map((item) => item.id), ['m1'])
    assert.deepEqual(targets[1].cleanupDates, ['2026-08-03'])
  })

  test('5-B-2: 연동 서브 표시 항목은 그 서브 칸 항목 단위 대상, 메인 칸은 그 날짜를 정리한다', () => {
    const targets = planExpenseVehicleTargets([MAIN, SUB], [{ id: 'd1', status: 'linked', vehicleNumber: '22나2222' }], [
      fuel('s1', '2026-08-03', '22나2222'),
    ])
    assert.equal(targets.length, 2)
    assert.equal(targets[0].vehicleId, 802)
    assert.equal(targets[0].mode, 'items')
    assert.deepEqual(targets[0].expenses.map((item) => item.id), ['s1'])
    assert.equal(targets[1].vehicleId, 501)
    assert.equal(targets[1].mode, 'dates')
    assert.deepEqual(targets[1].expenses, [])
    assert.deepEqual(targets[1].cleanupDates, ['2026-08-03'])
  })

  test('5-B-2: 미연동 서브도 남은 항목이 없어도 날짜별 대상에 들어간다(마지막 항목 삭제 반영)', () => {
    const targets = planExpenseVehicleTargets([MAIN, SUB], [], [])
    assert.equal(targets.length, 2)
    assert.equal(targets[0].vehicleId, 802)
    assert.equal(targets[0].mode, 'dates')
    assert.deepEqual(targets[0].expenses, [])
  })

  test('5-B-2: 연동 서브는 남은 항목이 없어도 대상에 들어간다(마지막 항목 삭제 반영)', () => {
    const targets = planExpenseVehicleTargets([MAIN, SUB], [{ id: 'd1', status: 'linked', vehicleNumber: '22나2222' }], [])
    assert.equal(targets.length, 2)
    assert.equal(targets[0].vehicleId, 802)
    assert.equal(targets[0].mode, 'items')
    assert.deepEqual(targets[0].expenses, [])
  })

  test('서버 id 없는 서브·못 찾는 차량번호는 메인 칸에 남는다', () => {
    const targets = planExpenseVehicleTargets([MAIN, SUB_LOCAL_ONLY], [], [
      fuel('a', '2026-08-01', '33다3333'),
      fuel('b', '2026-08-02', '없는번호'),
    ])
    assert.equal(targets.length, 1)
    assert.deepEqual(targets[0].expenses.map((item) => item.id), ['a', 'b'])
  })

  test('서버 id 있는 차량이 없으면 대상 없음(기존과 같이 서버 저장 생략)', () => {
    assert.deepEqual(planExpenseVehicleTargets([SUB_LOCAL_ONLY], [], [fuel('a', '2026-08-01')]), [])
  })

  test('기사 본인(차량이 배정 서브 1대뿐): 표시 없는 항목은 그 차량 칸 하나로 간다', () => {
    const targets = planExpenseVehicleTargets([SUB], [], [fuel('d1', '2026-09-04')])
    assert.equal(targets.length, 1)
    assert.equal(targets[0].vehicleId, 802)
    assert.equal(targets[0].logId, 'main')
    assert.deepEqual(targets[0].expenses.map((item) => item.id), ['d1'])
  })
})
