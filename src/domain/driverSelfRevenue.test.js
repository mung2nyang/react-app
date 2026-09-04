// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getDriverSelfMonthlyDetail } from './driverSelfRevenue.js'
import { FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.js'

/** 김기사 매출제 15% − 산재 3000 */
const REVENUE_SHARE = 64500
const SALARY = 2000000

describe('getDriverSelfMonthlyDetail', () => {
  test('(a) netProfit === income.settlement.total (월급+매출제 합)', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    assert.equal(detail.income.settlement.total, SALARY + REVENUE_SHARE)
    assert.equal(detail.netProfit, detail.income.settlement.total)
    assert.equal(detail.income.total, detail.income.settlement.total)
  })

  test('(b) income.fare.total은 본인 배정 차량 운송료 전체(정산 전)', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    // 서울12: 200000+250000, 부산33: 80000
    assert.equal(detail.income.fare.total, 530000)
    assert.ok(detail.income.fare.total > detail.income.settlement.total - SALARY)
  })

  test('(c) expense.total === 0 (정비/주유/급여 라인 전부 0)', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    assert.equal(detail.expense.total, 0)
    assert.equal(detail.expense.maint.total, 0)
    assert.equal(detail.expense.fuel.total, 0)
    assert.equal(detail.expense.misc.total, 0)
    assert.equal(detail.expense.salary.total, 0)
  })

  test('(d) 차주 몫(−%)이 settlement/expense 어디에도 안 들어간다', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    // 매출제 차량 운송료(450000) − 기사 정산(64500) = 차주 몫 385500 — 이 값이 라인에 없어야 함
    const ownerShareFromRevenueCar = 450000 - REVENUE_SHARE
    assert.equal(ownerShareFromRevenueCar, 385500)
    assert.ok(!('ownerShare' in detail.income))
    assert.ok(!detail.income.settlement.items.some((i) => i.amount === ownerShareFromRevenueCar))
    assert.ok(!detail.expense.salary.items.some((i) => i.amount === ownerShareFromRevenueCar))
    assert.ok(!detail.income.fare.items.some((i) => i.amount === ownerShareFromRevenueCar))
    // 합계는 정산액이지 (운송료 − 정산)이 아님
    assert.equal(detail.income.total, detail.income.settlement.total)
    assert.notEqual(detail.income.total, detail.income.fare.total - detail.income.settlement.total)
  })

  test('(e) insuranceOn이면 매출제 정산액에서 산재 차감', () => {
    const withIns = getDriverSelfMonthlyDetail(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    const withoutIns = getDriverSelfMonthlyDetail(MONTH_KEY, {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === '서울12가3456' ? { ...car, insuranceOn: false } : car
      )),
    }, FIXTURE_WORK)
    const kimWith = withIns.income.settlement.items.find((i) => i.label === '김기사')
    const kimWithout = withoutIns.income.settlement.items.find((i) => i.label === '김기사')
    assert.ok(kimWith && kimWithout)
    assert.equal(kimWith.amount, REVENUE_SHARE)
    assert.equal(kimWithout.amount, 67500)
    assert.equal(withIns.netProfit + 3000, withoutIns.netProfit)
  })

  test('매출제만이면 라벨이 기사 정산(15%)', () => {
    const settings = {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.filter((car) => car.number !== '부산33나1111'),
    }
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, settings, FIXTURE_WORK)
    assert.equal(detail.income.settlement.label, '기사 정산(15%)')
    assert.equal(detail.netProfit, REVENUE_SHARE)
  })

  test('월급제만이면 라벨이 기사 정산(월급)', () => {
    const settings = {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.filter((car) => car.number === '부산33나1111' || car.type === 'main'),
    }
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, settings, FIXTURE_WORK)
    assert.equal(detail.income.settlement.label, '기사 정산(월급)')
    assert.equal(detail.netProfit, SALARY)
  })

  test('빈 월/차량 없으면 전부 0', () => {
    const detail = getDriverSelfMonthlyDetail(MONTH_KEY, { cars: [] }, {})
    assert.equal(detail.netProfit, 0)
    assert.equal(detail.income.fare.total, 0)
    assert.equal(detail.income.settlement.total, 0)
    assert.equal(detail.expense.total, 0)
  })
})
