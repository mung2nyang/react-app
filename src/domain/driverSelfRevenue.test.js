// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getDriverSelfMonthlyDetail } from './driverSelfRevenue.js'
import { FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */

const REVENUE_CAR = /** @type {CarLike} */ (FIXTURE_SETTINGS.cars.find((c) => c.number === '서울12가3456'))
const SALARY_CAR = /** @type {CarLike} */ (FIXTURE_SETTINGS.cars.find((c) => c.number === '부산33나1111'))
const MAIN_ONLY_WORK = { main: FIXTURE_WORK['서울12가3456'] }

/** owner scope: fixed 250000 + call 200000, tripCount 2, 15% → 67500 − 산재 3000 */
const FARE_TOTAL = 450000
const TRIP_COUNT = 2
const SHARE_GROSS = 67500
const SHARE_NET = 64500
const SALARY = 2000000

/**
 * @param {Array<CarLike>} cars
 * @returns {FinanceSettings}
 */
function settingsWithCars(cars) {
  return {
    ...FIXTURE_SETTINGS,
    cars: [
      /** @type {CarLike} */ ({ type: 'main', number: '서울00가0000' }),
      ...cars,
    ],
  }
}

describe('getDriverSelfMonthlyDetail — main 키 전제 (§6)', () => {
  test('(b) {main: 트립} 입력 직후와 동일 — 순이익 = 운송료 × % − 산재', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([REVENUE_CAR]), MAIN_ONLY_WORK)
    assert.equal(detail.income.fare.total, FARE_TOTAL)
    assert.equal(detail.tripCount, TRIP_COUNT)
    assert.equal(detail.income.settlement.total, SHARE_NET)
    assert.equal(detail.netProfit, SHARE_NET)
    assert.equal(detail.income.total, SHARE_NET)
    assert.equal(detail.income.settlement.label, '기사 정산(15%)')
  })

  test('번호판 키만 있고 main 비면 운송료·정산 0 (키 미통일 회귀 방지)', () => {
    const detail = getDriverSelfMonthlyDetail(
      MONTH_KEY,
      settingsWithCars([REVENUE_CAR]),
      { '서울12가3456': FIXTURE_WORK['서울12가3456'] },
    )
    assert.equal(detail.income.fare.total, 0)
    assert.equal(detail.netProfit, 0)
  })

  test('(c) insuranceOn이면 산재 차감 (totals link=null, fare 기준 commission)', () => {
    const withIns = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([REVENUE_CAR]), MAIN_ONLY_WORK)
    const withoutIns = getDriverSelfMonthlyDetail(
      MONTH_KEY,
      settingsWithCars([{ ...REVENUE_CAR, insuranceOn: false }]),
      MAIN_ONLY_WORK,
    )
    assert.equal(withIns.netProfit, SHARE_NET)
    assert.equal(withoutIns.netProfit, SHARE_GROSS)
    assert.equal(withIns.netProfit + 3000, withoutIns.netProfit)
  })

  test('(d) 월급제 — 고정급, 라벨 기사 정산(월급)', () => {
    const detail = getDriverSelfMonthlyDetail(
      MONTH_KEY,
      settingsWithCars([SALARY_CAR]),
      { main: FIXTURE_WORK['부산33나1111'] },
    )
    assert.equal(detail.netProfit, SALARY)
    assert.equal(detail.income.settlement.total, SALARY)
    assert.equal(detail.income.settlement.label, '기사 정산(월급)')
  })

  test('expense.total === 0', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([REVENUE_CAR]), MAIN_ONLY_WORK)
    assert.equal(detail.expense.total, 0)
    assert.equal(detail.expense.salary.total, 0)
  })

  test('배정차 0대 → 정산 0 가드', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, { ...FIXTURE_SETTINGS, cars: [] }, MAIN_ONLY_WORK)
    assert.equal(detail.netProfit, 0)
    assert.equal(detail.income.settlement.total, 0)
    assert.equal(detail.income.settlement.label, '기사 정산')
  })

  test('차주 몫이 settlement 라인에 안 들어감', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([REVENUE_CAR]), MAIN_ONLY_WORK)
    const ownerShare = FARE_TOTAL - SHARE_NET
    assert.ok(ownerShare > 0)
    assert.ok(!detail.income.settlement.items.some((i) => i.amount === ownerShare))
    assert.equal(detail.income.total, detail.income.settlement.total)
  })
})
