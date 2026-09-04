// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getDriverSelfMonthlyDetail } from './driverSelfRevenue.js'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.js'
import { FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').DriverLinkLike} DriverLinkLike */

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
 * @param {Array<DriverLinkLike>} [driverLinks]
 * @returns {FinanceSettings}
 */
function settingsWithCars(cars, driverLinks = FIXTURE_SETTINGS.driverLinks) {
  return {
    ...FIXTURE_SETTINGS,
    driverLinks,
    cars: [
      /** @type {CarLike} */ ({ type: 'main', number: '서울00가0000' }),
      ...cars,
    ],
  }
}

describe('getDriverSelfMonthlyDetail — main 키 전제 (§6)', () => {
  test('(b) {main: 트립} 입력 직후와 동일 — 순이익 = 배정기간 내 운송료 × % − 산재', () => {
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

  test('(c) insuranceOn이면 산재 차감 (totals link 필터, totals 기준 commission)', () => {
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

  test('expense.total === 0 (expenses 없을 때)', () => {
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

  test('지출이 있어도 netProfit은 정산액 유지(Q1)', () => {
    /** @type {Array<import('./expenseTypes.js').ExpenseItem>} */
    const expenses = [
      { id: 'maint-1', kind: 'maint', date: '2026-05-12', name: '오일', cost: 50000 },
      { id: 'fuel-1', kind: 'fuel', date: '2026-05-12', fuelType: '주유', cost: 80000, subsidy: 0, liters: 40 },
    ]
    const without = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([REVENUE_CAR]), MAIN_ONLY_WORK, [])
    const withExp = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([REVENUE_CAR]), MAIN_ONLY_WORK, expenses)
    assert.equal(withExp.netProfit, SHARE_NET)
    assert.equal(withExp.netProfit, without.netProfit)
    assert.equal(withExp.income.total, SHARE_NET)
    assert.ok(withExp.expense.total > 0)
    assert.equal(withExp.expense.maint.total, 50000)
    assert.equal(withExp.expense.fuel.total, 80000)
  })

  test('① 배정기간 밖 트립은 정산액에서 제외된다', () => {
    const car = /** @type {CarLike} */ ({ ...REVENUE_CAR, insuranceOn: false })
    /** @type {import('./financeTypes.js').WorkDataByLogId} */
    const work = {
      main: {
        '2026-05-10': {
          callDetails: [{ id: 'in-range', client: '대한', fare: 100000 }],
        },
        '2026-05-25': {
          callDetails: [{ id: 'out-of-range', client: '대한', fare: 100000 }],
        },
      },
    }
    const narrowLinks = /** @type {Array<DriverLinkLike>} */ ([{
      id: 'link-narrow',
      vehicleNumber: '서울12가3456',
      assignmentStart: '2026-05-01',
      assignmentEnd: '2026-05-15',
      status: 'linked',
    }])
    const fullLinks = /** @type {Array<DriverLinkLike>} */ ([{
      id: 'link-full',
      vehicleNumber: '서울12가3456',
      assignmentStart: '2026-05-01',
      assignmentEnd: '2026-05-31',
      status: 'linked',
    }])
    const narrow = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([car], narrowLinks), work)
    const full = getDriverSelfMonthlyDetail(MONTH_KEY, settingsWithCars([car], fullLinks), work)
    assert.equal(narrow.netProfit, 15000, '배정기간 안 100,000 × 15%')
    assert.equal(full.netProfit, 30000, '월 전체 200,000 × 15%')
    assert.ok(narrow.netProfit < full.netProfit)
    assert.equal(narrow.income.fare.total, 200000, '운송료 표시 라인은 배정기간 필터 안 함')
  })

  test('② settlement == 차주 all 탭 salary (같은 트립·main↔번호판)', () => {
    const plateWork = FIXTURE_WORK['서울12가3456']
    const settings = settingsWithCars([REVENUE_CAR])
    const self = getDriverSelfMonthlyDetail(MONTH_KEY, settings, { main: plateWork })
    const ownerAll = getOwnerMonthlyFinanceDetail(
      MONTH_KEY,
      'all',
      settings,
      { main: {}, '서울12가3456': plateWork },
      [],
    )
    assert.equal(self.income.settlement.total, SHARE_NET)
    assert.equal(ownerAll.expense.salary.total, SHARE_NET)
    assert.equal(self.income.settlement.total, ownerAll.expense.salary.total)
  })
})
