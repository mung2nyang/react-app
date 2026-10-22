// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getMonthlyDriverInsuranceOwnerShare, getMonthlyDriverRevenueShareExpense } from './driverRevenueShareExpense.ts'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.ts'
import { FIXTURE_EXPENSES, FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.ts'

// 산재 규칙 재설계(로드맵 4-2): 매출제 정산액은 산재를 빼지 않은 기사 몫 전체이고, 산재보험료는 기사 정산액 기준
// 월 단위로 따로 계산한다(건별 산재 합계는 더 쓰지 않는다).
/** 픽스처 서울12가3456(김기사): gross 450000 × 15% = 67500. */
const REVENUE_SHARE = 67500
/**
 * 산재(기본 경비율 30.5%·요율 1.8%): 월보수액 = 67500 − floor(67500×30.5%=20587.5→20587) = 46913,
 * 총액 = floor(46913×1.8%=844.4) = 844. 산재 적용 ON → 기사 422·차주 422, OFF → 차주 844.
 */
const KIM_INSURANCE_OWNER_ON = 422
const KIM_INSURANCE_OWNER_EMPLOYEE = 844
const SALARY_AMOUNT = 2000000
/** 픽스처 박기사 월급제 2,000,000: 월보수액 1,390,000 × 1.8% = 25,020(4대보험 근로자 → 전액 차주). */
const PARK_INSURANCE_OWNER = 25020

describe('getMonthlyDriverRevenueShareExpense', () => {
  test('매출제 차량은 fare합계 × % 전체를 기사 급여 지출로 잡는다(산재를 빼지 않는다)', () => {
    const subCars = FIXTURE_SETTINGS.cars.filter((c) => c.type === 'sub')
    const result = getMonthlyDriverRevenueShareExpense(MONTH_KEY, FIXTURE_SETTINGS, subCars, FIXTURE_WORK)
    assert.equal(result.total, REVENUE_SHARE)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].label, '김기사 (5/1~5/31)')
    assert.equal(result.items[0].amount, REVENUE_SHARE)
  })

  test('insuranceOn을 꺼도 기사 급여 지출(정산액)은 같다', () => {
    const settings = {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === '서울12가3456' ? { ...car, insuranceOn: false } : car
      )),
    }
    const subCars = settings.cars.filter((c) => c.type === 'sub')
    const result = getMonthlyDriverRevenueShareExpense(MONTH_KEY, settings, subCars, FIXTURE_WORK)
    assert.equal(result.total, REVENUE_SHARE)
  })

  test('월급제 차량은 건너뛴다', () => {
    const onlySalary = FIXTURE_SETTINGS.cars.filter((c) => c.driverPayMode === 'salary')
    const result = getMonthlyDriverRevenueShareExpense(MONTH_KEY, FIXTURE_SETTINGS, onlySalary, FIXTURE_WORK)
    assert.equal(result.total, 0)
    assert.equal(result.items.length, 0)
  })
})

describe('getMonthlyDriverInsuranceOwnerShare — 산재보험료 차주 부담분', () => {
  const subCars = FIXTURE_SETTINGS.cars.filter((c) => c.type === 'sub')

  test('사업소득자(김기사)는 총액의 절반, 4대보험 근로자(박기사)는 총액 전부가 차주 몫', () => {
    const result = getMonthlyDriverInsuranceOwnerShare(MONTH_KEY, FIXTURE_SETTINGS, subCars, FIXTURE_WORK)
    assert.deepEqual(
      result.items.map((item) => [item.label, item.amount]),
      [['김기사 (5/1~5/31) 산재보험(차주 부담)', KIM_INSURANCE_OWNER_ON], ['박기사 산재보험(차주 부담)', PARK_INSURANCE_OWNER]],
    )
    assert.equal(result.total, KIM_INSURANCE_OWNER_ON + PARK_INSURANCE_OWNER)
  })

  test('매출제도 4대보험 근로자면 총액 전부가 차주 몫', () => {
    const cars = subCars.map((car) => (car.number === '서울12가3456' ? { ...car, driverIncomeType: /** @type {'employee'} */ ('employee') } : car))
    const result = getMonthlyDriverInsuranceOwnerShare(MONTH_KEY, FIXTURE_SETTINGS, cars, FIXTURE_WORK)
    assert.equal(result.items.find((item) => item.label.startsWith('김기사 (5/1~5/31)'))?.amount, KIM_INSURANCE_OWNER_EMPLOYEE)
  })

  test('산재 적용을 끄면 산재보험료가 없다 — 항목이 생기지 않는다', () => {
    const cars = subCars.map((car) => ({ ...car, insuranceOn: false }))
    const result = getMonthlyDriverInsuranceOwnerShare(MONTH_KEY, FIXTURE_SETTINGS, cars, FIXTURE_WORK)
    assert.equal(result.total, 0)
    assert.equal(result.items.length, 0)
  })

  test('요율 0은 산재 적용 제외 — 항목이 생기지 않는다', () => {
    const cars = subCars.map((car) => ({ ...car, insuranceRate: '0' }))
    const result = getMonthlyDriverInsuranceOwnerShare(MONTH_KEY, FIXTURE_SETTINGS, cars, FIXTURE_WORK)
    assert.equal(result.total, 0)
    assert.equal(result.items.length, 0)
  })

  test('정산액이 0이면(운행 없음) 항목이 생기지 않는다', () => {
    const result = getMonthlyDriverInsuranceOwnerShare('2026-06', FIXTURE_SETTINGS, subCars.filter((c) => c.driverPayMode !== 'salary'), FIXTURE_WORK)
    assert.equal(result.total, 0)
  })
})

describe('getOwnerMonthlyFinanceDetail — C-3 월급제+매출제 합산', () => {
  test('(a)(b) 전체/기사 손익 salary = 월급 + 매출제 정산액 + 산재 차주 몫, items 4개', () => {
    for (const scope of ['all', 'driver']) {
      const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, scope, FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
      assert.equal(detail.expense.salary.total, SALARY_AMOUNT + REVENUE_SHARE + KIM_INSURANCE_OWNER_ON + PARK_INSURANCE_OWNER, scope)
      assert.equal(detail.expense.salary.items.length, 4, scope)
      const labels = detail.expense.salary.items.map((i) => i.label).sort()
      assert.deepEqual(labels, ['김기사 (5/1~5/31)', '김기사 (5/1~5/31) 산재보험(차주 부담)', '박기사', '박기사 산재보험(차주 부담)'])
    }
  })

  test('(c) 차주 탭(scope=owner)에서는 salary.total === 0', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
    assert.equal(detail.expense.salary.total, 0)
    assert.equal(detail.expense.salary.items.length, 0)
  })

  test('(d) 김기사를 4대보험 근로자로 바꾸면 정산액은 그대로이고 산재 차주 몫만 절반에서 전액으로 늘어난다', () => {
    const withIns = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'all', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    const withoutIns = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'all', {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === '서울12가3456' ? { ...car, driverIncomeType: /** @type {'employee'} */ ('employee') } : car
      )),
    }, FIXTURE_WORK, [])
    const find = (/** @type {typeof withIns} */ detail, /** @type {string} */ label) => detail.expense.salary.items.find((i) => i.label === label)?.amount
    assert.equal(find(withIns, '김기사 (5/1~5/31)'), REVENUE_SHARE)
    assert.equal(find(withoutIns, '김기사 (5/1~5/31)'), REVENUE_SHARE)
    assert.equal(find(withIns, '김기사 (5/1~5/31) 산재보험(차주 부담)'), KIM_INSURANCE_OWNER_ON)
    assert.equal(find(withoutIns, '김기사 (5/1~5/31) 산재보험(차주 부담)'), KIM_INSURANCE_OWNER_EMPLOYEE)
    assert.equal(withIns.expense.salary.total + (KIM_INSURANCE_OWNER_EMPLOYEE - KIM_INSURANCE_OWNER_ON), withoutIns.expense.salary.total)
  })
})

describe('기사 급여 계약 기간 — 연동 중 계약만, 기간·계약 밖 운송료를 이름에(로드맵 41-A)', () => {
  /** @type {import('./financeTypes.ts').CarLike} */
  const car = { type: 'sub', number: '22가2222', driverName: '테스트2', driverPayMode: 'revenue', commEnabled: true, commType: 'percent', commission: '20', shareRevenueWithOwner: true }
  const work = {
    '22가2222': {
      '2026-10-05': { callDetails: [{ id: 'a', client: 'A', fare: 400000 }] },
      '2026-10-12': { callDetails: [{ id: 'b', client: 'A', fare: 300000 }] },
    },
  }
  /** @param {Array<import('./financeTypes.ts').DriverLinkLike>} driverLinks */
  const run = (driverLinks) => getMonthlyDriverRevenueShareExpense('2026-10', { cars: [car], driverLinks }, [car], work)

  test('연동 중 계약(10/12~)이면 기간 안 30만원분만, 이름에 기간과 계약 밖 운송료', () => {
    const result = run([{ id: 'l1', vehicleNumber: '22가2222', assignmentStart: '2026-10-12', status: 'linked' }])
    assert.equal(result.total, 60000)
    assert.equal(result.items[0].label, '테스트2 (10/12~), 계약 밖 운송료 400,000원 제외')
  })

  test('종료일이 있으면 시작~종료를 붙인다', () => {
    const result = run([{ id: 'l1', vehicleNumber: '22가2222', assignmentStart: '2026-10-01', assignmentEnd: '2026-10-31', status: 'linked' }])
    assert.equal(result.total, 140000)
    assert.equal(result.items[0].label, '테스트2 (10/1~10/31)')
  })

  test('대기 중(pending) 초대는 기간을 자르지 않는다 — 그 달 전부, 이름만', () => {
    const result = run([{ id: 'p1', vehicleNumber: '22가2222', assignmentStart: '2026-10-12', status: 'pending' }])
    assert.equal(result.total, 140000)
    assert.equal(result.items[0].label, '테스트2')
  })

  test('대기 중 초대가 앞에 있어도 연동 중 계약을 쓴다', () => {
    const result = run([
      { id: 'p1', vehicleNumber: '22가2222', assignmentStart: '2026-10-20', status: 'pending' },
      { id: 'l1', vehicleNumber: '22가2222', assignmentStart: '2026-10-12', status: 'linked' },
    ])
    assert.equal(result.total, 60000)
  })
})

