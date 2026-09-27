// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  DEFAULT_EXPENSE_RATE, DEFAULT_INSURANCE_RATE, EXPENSE_RATE_PRESETS, NEW_DRIVER_INCOME_DRAFT,
  driverIncomeDraftFromCar, driverIncomeFieldsFromDraft, getDriverIncomeDeductions,
  getDriverSettlementAmount, getDriverSettlementBreakdown,
} from './driverIncomeDeductions.js'
import { upsertCar } from './cars.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */

/** 사업소득자(3.3%): 산재·원천징수 둘 다 켬 */
const BUSINESS_CAR = /** @type {CarLike} */ ({ number: '12가3456', driverIncomeType: 'business', insuranceOn: true, withholdingOn: true })
/** 4대보험 근로자: 산재·원천징수 둘 다 끔 */
const EMPLOYEE_CAR = /** @type {CarLike} */ ({ number: '12가3456', driverIncomeType: 'employee', insuranceOn: false, withholdingOn: false })

// 보리 확정 규칙(2026-09-27, docs/roadmap.md 4-2)의 예시 3개 — 이 값이 정답이다.
describe('getDriverIncomeDeductions — 확정 규칙 예시', () => {
  test('매출제 20%, 운송료 1,000,000 → 정산액 200,000, 사업소득자(둘 다 ON)', () => {
    // 월보수액 200,000 − 61,000 = 139,000 → 산재 2,502 → 기사 1,251·차주 1,251, 3.3% 6,600
    assert.deepEqual(getDriverIncomeDeductions(BUSINESS_CAR, 200000), {
      settlementAmount: 200000,
      insuranceBase: 139000,
      insuranceTotal: 2502,
      insuranceDriverShare: 1251,
      insuranceOwnerShare: 1251,
      withholding: 6600,
      driverNet: 192149,
    })
  })

  test('월급제 2,000,000, 사업소득자(둘 다 ON)', () => {
    const result = getDriverIncomeDeductions(BUSINESS_CAR, 2000000)
    assert.equal(result.insuranceBase, 1390000)
    assert.equal(result.insuranceTotal, 25020)
    assert.equal(result.insuranceDriverShare, 12510)
    assert.equal(result.insuranceOwnerShare, 12510)
    assert.equal(result.withholding, 66000)
    assert.equal(result.driverNet, 1921490)
  })

  test('월급제 2,000,000, 4대보험 근로자(둘 다 OFF) — 산재 총액 전부 차주 몫, 기사 공제 없음', () => {
    const result = getDriverIncomeDeductions(EMPLOYEE_CAR, 2000000)
    assert.equal(result.insuranceTotal, 25020)
    assert.equal(result.insuranceDriverShare, 0)
    assert.equal(result.insuranceOwnerShare, 25020)
    assert.equal(result.withholding, 0)
    assert.equal(result.driverNet, 2000000)
  })
})

describe('getDriverIncomeDeductions — 토글·요율·경계', () => {
  test('산재만 켜면 3.3%는 없고, 원천징수만 켜면 산재 기사 몫은 없다', () => {
    const onlyInsurance = getDriverIncomeDeductions({ ...BUSINESS_CAR, withholdingOn: false }, 200000)
    assert.equal(onlyInsurance.withholding, 0)
    assert.equal(onlyInsurance.driverNet, 200000 - 1251)
    const onlyWithholding = getDriverIncomeDeductions({ ...BUSINESS_CAR, insuranceOn: false }, 200000)
    assert.equal(onlyWithholding.insuranceDriverShare, 0)
    assert.equal(onlyWithholding.insuranceOwnerShare, 2502)
    assert.equal(onlyWithholding.driverNet, 200000 - 6600)
  })

  test('3.3% 기준은 산재 공제 전 정산액이다(산재 몫을 뺀 금액이 아니다)', () => {
    assert.equal(getDriverIncomeDeductions(BUSINESS_CAR, 200000).withholding, Math.floor(200000 * 0.033))
  })

  test('총액이 홀수면 기사 몫은 버림, 나머지는 차주 몫(합은 총액과 같다)', () => {
    // 정산액 67,500: 월보수액 46,913 → 총액 844(짝수). 정산액 100,001: 월보수액 69,501 → 총액 1,251(홀수)
    const result = getDriverIncomeDeductions(BUSINESS_CAR, 100001)
    assert.equal(result.insuranceTotal, 1251)
    assert.equal(result.insuranceDriverShare, 625)
    assert.equal(result.insuranceOwnerShare, 626)
    assert.equal(result.insuranceDriverShare + result.insuranceOwnerShare, result.insuranceTotal)
  })

  test('산재요율 0은 산재 적용 제외 — 총액·기사 몫·차주 몫 모두 0', () => {
    const result = getDriverIncomeDeductions({ ...BUSINESS_CAR, insuranceRate: '0' }, 200000)
    assert.equal(result.insuranceTotal, 0)
    assert.equal(result.insuranceOwnerShare, 0)
    assert.equal(result.driverNet, 200000 - 6600)
  })

  test('필요경비율 43.1%(특수차량)와 직접 수정한 값이 월보수액에 반영된다', () => {
    assert.equal(getDriverIncomeDeductions({ ...BUSINESS_CAR, expenseRate: '43.1' }, 200000).insuranceBase, 200000 - 86200)
    assert.equal(getDriverIncomeDeductions({ ...BUSINESS_CAR, expenseRate: 50 }, 200000).insuranceBase, 100000)
  })

  test('요율이 비었거나 숫자가 아니면 기본값, 범위 밖은 0~100으로 맞춘다', () => {
    const base = getDriverIncomeDeductions(BUSINESS_CAR, 200000)
    assert.deepEqual(getDriverIncomeDeductions({ ...BUSINESS_CAR, expenseRate: '', insuranceRate: '가나다' }, 200000), base)
    assert.equal(getDriverIncomeDeductions({ ...BUSINESS_CAR, expenseRate: '150' }, 200000).insuranceBase, 0)
    assert.equal(getDriverIncomeDeductions({ ...BUSINESS_CAR, expenseRate: '-5' }, 200000).insuranceBase, 200000)
  })

  test('원 미만은 버리되 소수 요율 곱셈 오차로 1원 어긋나지 않는다(11,000원의 0.7%는 정확히 77원)', () => {
    // 11000 * 0.7 / 100 은 부동소수점으로 76.99999…가 되어 그대로 버림하면 76원이 된다.
    const result = getDriverIncomeDeductions({ ...BUSINESS_CAR, expenseRate: '0', insuranceRate: '0.7' }, 11000)
    assert.equal(result.insuranceTotal, 77)
  })

  test('정산액이 0·음수·숫자 아님이면 전부 0', () => {
    for (const amount of [0, -1000, NaN]) {
      const result = getDriverIncomeDeductions(BUSINESS_CAR, amount)
      assert.equal(result.settlementAmount, 0)
      assert.equal(result.insuranceTotal, 0)
      assert.equal(result.withholding, 0)
      assert.equal(result.driverNet, 0)
    }
  })

  test('차량이 없거나 설정이 비어 있으면 기존 동작 유지(기사 공제 없음), 산재 총액만 기본 요율로 계산', () => {
    const result = getDriverIncomeDeductions(null, 200000)
    assert.equal(result.insuranceDriverShare, 0)
    assert.equal(result.withholding, 0)
    assert.equal(result.insuranceTotal, 2502)
    assert.equal(result.driverNet, 200000)
  })
})

describe('정산액·정산 요약', () => {
  test('월급제는 월급, 매출제는 기사 몫(수수료 계산 결과)이 정산액이다', () => {
    assert.equal(getDriverSettlementAmount({ number: 'a', driverPayMode: 'salary', driverSalaryAmount: '2,000,000' }, 999), 2000000)
    assert.equal(getDriverSettlementAmount({ number: 'a', driverPayMode: 'revenue' }, 200000), 200000)
    assert.equal(getDriverSettlementAmount({ number: 'a' }, 150000), 150000, '미설정(레거시)은 매출제')
  })

  test('정산 요약: 총 운송료·기사 정산금·산재(기사 몫)·원천징수·최종 실수령', () => {
    const detail = { totalFare: 1000000, commissionAmount: 200000 }
    const result = getDriverSettlementBreakdown(detail, { ...BUSINESS_CAR, driverPayMode: 'revenue' })
    assert.equal(result.totalFare, 1000000)
    assert.equal(result.settlementAmount, 200000)
    assert.equal(result.insuranceDriverShare, 1251)
    assert.equal(result.withholding, 6600)
    assert.equal(result.driverNet, 192149)
  })

  test('정산 요약: 월급제는 운송료와 무관하게 월급 기준이다', () => {
    const result = getDriverSettlementBreakdown({ totalFare: 500000, commissionAmount: 0 }, { ...BUSINESS_CAR, driverPayMode: 'salary', driverSalaryAmount: '2000000' })
    assert.equal(result.settlementAmount, 2000000)
    assert.equal(result.driverNet, 1921490)
  })

  test('정산 요약: detail이 없어도 0으로 안전하다', () => {
    const result = getDriverSettlementBreakdown(null, undefined)
    assert.equal(result.totalFare, 0)
    assert.equal(result.driverNet, 0)
  })
})

describe('차량 폼 draft ↔ 저장 필드', () => {
  test('새 차량 폼 기본값은 사업소득자 + 산재·원천징수 ON, 경비율 30.5·요율 1.8', () => {
    assert.deepEqual(NEW_DRIVER_INCOME_DRAFT, {
      driverIncomeType: 'business', insuranceOn: true, withholdingOn: true,
      expenseRate: DEFAULT_EXPENSE_RATE, insuranceRate: DEFAULT_INSURANCE_RATE,
    })
    assert.equal(DEFAULT_EXPENSE_RATE, '30.5')
    assert.equal(DEFAULT_INSURANCE_RATE, '1.8')
  })

  test('품목·차종 기본값은 30.5%와 43.1% 두 종류다(살수차·카고크레인·렉카차만 43.1%)', () => {
    assert.equal(EXPENSE_RATE_PRESETS.length, 10)
    assert.deepEqual([...new Set(EXPENSE_RATE_PRESETS.map((p) => p.rate))].sort(), ['30.5', '43.1'])
    assert.deepEqual(EXPENSE_RATE_PRESETS.filter((p) => p.rate === '43.1').map((p) => p.label), ['살수차', '카고크레인', '렉카차 (구난형 특수자동차)'])
  })

  test('driverIncomeFieldsFromDraft: 빈 요율은 기본값, 이상한 유형은 사업소득자, 숫자 문자열로 정리', () => {
    assert.deepEqual(driverIncomeFieldsFromDraft({ driverIncomeType: '?', expenseRate: '', insuranceRate: '1.80' }), {
      driverIncomeType: 'business', insuranceOn: false, withholdingOn: false, expenseRate: '30.5', insuranceRate: '1.8',
    })
    assert.equal(driverIncomeFieldsFromDraft({ driverIncomeType: 'employee' }).driverIncomeType, 'employee')
  })

  test('driverIncomeDraftFromCar: 새 필드가 없는 기존 차량은 원천징수 꺼짐·사업소득자·기본 요율(기존 동작 유지)', () => {
    assert.deepEqual(driverIncomeDraftFromCar({ number: 'a', insuranceOn: true }), {
      driverIncomeType: 'business', insuranceOn: true, withholdingOn: false, expenseRate: '30.5', insuranceRate: '1.8',
    })
    assert.deepEqual(driverIncomeDraftFromCar({ number: 'a', driverIncomeType: 'employee', withholdingOn: true, expenseRate: 43.1, insuranceRate: '0' }), {
      driverIncomeType: 'employee', insuranceOn: false, withholdingOn: true, expenseRate: '43.1', insuranceRate: '0',
    })
  })

  test('upsertCar: 기사차량은 새 필드를 저장하고 메인 차량에는 붙이지 않는다', () => {
    const sub = upsertCar([], {
      number: '12가3456', type: 'sub', driverPayMode: 'revenue', commission: '20',
      driverIncomeType: 'employee', insuranceOn: false, withholdingOn: false, expenseRate: '43.1', insuranceRate: '2',
    }).cars?.[0]
    assert.equal(sub?.driverIncomeType, 'employee')
    assert.equal(sub?.withholdingOn, false)
    assert.equal(sub?.expenseRate, '43.1')
    assert.equal(sub?.insuranceRate, '2')
    const main = upsertCar([], { number: '99가9999', type: 'main', driverIncomeType: 'employee', withholdingOn: true, expenseRate: '43.1' }).cars?.[0]
    assert.equal(main?.type, 'main')
    for (const key of ['driverIncomeType', 'withholdingOn', 'expenseRate', 'insuranceRate']) {
      assert.equal(key in (main || {}), false, `메인 차량에 ${key}가 저장되면 안 된다`)
    }
    assert.equal(main?.insuranceOn, false)
  })
})
