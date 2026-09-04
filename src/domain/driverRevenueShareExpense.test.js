// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getMonthlyDriverRevenueShareExpense } from './driverRevenueShareExpense.js'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.js'
import { FIXTURE_EXPENSES, FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.js'

/** 픽스처 서울12가3456: gross 450000 × 15% = 67500, 산재 3000 → 64500 */
const REVENUE_SHARE_WITH_INSURANCE = 64500
/** 산재 OFF 시 67500 */
const REVENUE_SHARE_GROSS = 67500
const SALARY_AMOUNT = 2000000

describe('getMonthlyDriverRevenueShareExpense', () => {
  test('매출제 차량의 fare합계 × %에서 산재를 차감한다', () => {
    const subCars = FIXTURE_SETTINGS.cars.filter((c) => c.type === 'sub')
    const result = getMonthlyDriverRevenueShareExpense(MONTH_KEY, FIXTURE_SETTINGS, subCars, FIXTURE_WORK)
    assert.equal(result.total, REVENUE_SHARE_WITH_INSURANCE)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].label, '김기사')
    assert.equal(result.items[0].amount, REVENUE_SHARE_WITH_INSURANCE)
  })

  test('insuranceOn이 꺼지면 산재를 차감하지 않는다', () => {
    const settings = {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === '서울12가3456' ? { ...car, insuranceOn: false } : car
      )),
    }
    const subCars = settings.cars.filter((c) => c.type === 'sub')
    const result = getMonthlyDriverRevenueShareExpense(MONTH_KEY, settings, subCars, FIXTURE_WORK)
    assert.equal(result.total, REVENUE_SHARE_GROSS)
  })

  test('월급제 차량은 건너뛴다', () => {
    const onlySalary = FIXTURE_SETTINGS.cars.filter((c) => c.driverPayMode === 'salary')
    const result = getMonthlyDriverRevenueShareExpense(MONTH_KEY, FIXTURE_SETTINGS, onlySalary, FIXTURE_WORK)
    assert.equal(result.total, 0)
    assert.equal(result.items.length, 0)
  })
})

describe('getOwnerMonthlyFinanceDetail — C-3 월급제+매출제 합산', () => {
  test('(a)(b) 전체/기사 손익 salary = 월급 + 매출제, items에 두 기사', () => {
    for (const scope of ['all', 'driver']) {
      const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, scope, FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
      assert.equal(detail.expense.salary.total, SALARY_AMOUNT + REVENUE_SHARE_WITH_INSURANCE, scope)
      assert.equal(detail.expense.salary.items.length, 2, scope)
      const labels = detail.expense.salary.items.map((i) => i.label).sort()
      assert.deepEqual(labels, ['김기사', '박기사'])
    }
  })

  test('(c) 차주 탭(scope=owner)에서는 salary.total === 0', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
    assert.equal(detail.expense.salary.total, 0)
    assert.equal(detail.expense.salary.items.length, 0)
  })

  test('(d) insuranceOn 켠 케이스에서 산재가 매출제 정산액에서 차감', () => {
    const withIns = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'all', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    const withoutIns = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'all', {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === '서울12가3456' ? { ...car, insuranceOn: false } : car
      )),
    }, FIXTURE_WORK, [])
    const kimWith = withIns.expense.salary.items.find((i) => i.label === '김기사')
    const kimWithout = withoutIns.expense.salary.items.find((i) => i.label === '김기사')
    assert.ok(kimWith && kimWithout)
    assert.equal(kimWith.amount, REVENUE_SHARE_WITH_INSURANCE)
    assert.equal(kimWithout.amount, REVENUE_SHARE_GROSS)
    assert.equal(withIns.expense.salary.total + 3000, withoutIns.expense.salary.total)
  })
})
