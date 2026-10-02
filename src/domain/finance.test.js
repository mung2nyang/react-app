import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculatePaymentDueDate } from './clients.js'
import { isDateWithinAssignment } from './drivers.js'
import {
  calculateDriverVehicleCommission,
  getCallDetailCommissionAmount,
  getDetailPaymentSummary,
  getLinkedDriverSettlementDetail,
  getMonthlyDriverTotals,
  getMonthlyFareRevenue,
  getOwnerMonthlyFinanceDetail,
  getOverdueReceivableItems,
  getReceivableItems,
  getTaxInvoiceSourceGroups,
} from './finance.js'
import { FIXTURE_EXPENSES, FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.js'
import { parseCurrencyValue } from './money.js'

/** @template T @param {T} a @param {T} b */
function same(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b))
}

// 아래 기대값은 확정 규칙 기준 직접 값이다. 2026-09에 원본 앱 대조에서 전환했고,
// 그 시점에 원본과 일치가 확인된 값이다(원본과 다르게 확정한 부분은 해당 테스트에 표시).
describe('기본 계산 규칙', () => {
  test('parseCurrencyValue', () => {
    assert.equal(parseCurrencyValue('250,000'), 250000)
    assert.equal(parseCurrencyValue(''), 0)
    assert.equal(parseCurrencyValue(null), 0)
    assert.equal(parseCurrencyValue(undefined), 0)
    assert.equal(parseCurrencyValue(250000), 250000)
    assert.equal(parseCurrencyValue('원'), 0)
  })

  test('isDateWithinAssignment', () => {
    // [날짜, 시작, 끝, 기대값] — 경계일 포함, 시작/끝이 비면 그쪽은 제한 없음
    const cases = [
      ['2026-05-15', '2026-05-01', '2026-05-31', true],
      ['2026-04-30', '2026-05-01', '2026-05-31', false],
      ['2026-06-01', '2026-05-01', '2026-05-31', false],
      ['2026-05-01', '2026-05-01', '2026-05-31', true],
      ['2026-05-31', '2026-05-01', '2026-05-31', true],
      ['2020-01-01', '', '2026-05-31', true],
      ['2099-01-01', '', '', true],
    ]
    for (const [date, start, end, expected] of cases) {
      assert.equal(isDateWithinAssignment(date, start, end), expected, String([date, start, end]))
    }
  })

  test('getDetailPaymentSummary', () => {
    const samples = [
      [{ fare: '300,000', paymentStatus: '미수' }, { paidAmount: 0, remainingAmount: 300000, status: 'unpaid' }],
      [{ fare: '300,000', paymentStatus: '수금 완료' }, { paidAmount: 300000, remainingAmount: 0, status: 'paid' }],
      [{ fare: 300000, payments: [{ amount: 100000 }] }, { paidAmount: 100000, remainingAmount: 200000, status: 'partial' }],
      [{ fare: 300000, payments: [{ amount: 300000 }] }, { paidAmount: 300000, remainingAmount: 0, status: 'paid' }],
      // 운임보다 많이 입금돼도 남은 금액은 0(음수 안 됨)
      [{ fare: 300000, payments: [{ amount: 200000 }, { amount: 200000 }] }, { paidAmount: 400000, remainingAmount: 0, status: 'paid' }],
    ]
    for (const [detail, expected] of samples) {
      same(getDetailPaymentSummary(detail), expected)
    }
  })
})

describe('같은 운행 픽스처 — 확정 금액', () => {
  test('월 운송료 합계', () => {
    const ours = getMonthlyFareRevenue(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    // Step 9-B: isVehicleRevenueSharedWithOwner 단일 게이트 — shareRevenueWithOwner 서브차량은
    // settlementMode와 무관하게 포함(부산33나1111 운임 80,000·1회 추가). 원본은 이 차량을 뺀
    // 1,110,000원·6회였고, 확정 규칙은 포함이다.
    assert.equal(ours.totalFare, 1190000)
    assert.equal(ours.tripCount, 7)
    assert.deepEqual(
      ours.byVehicle.map((item) => [item.logId, item.fare, item.tripCount]),
      [['main', 660000, 4], ['서울12가3456', 450000, 2], ['부산33나1111', 80000, 1]],
    )
  })

  test('차주 월 손익', () => {
    // 재감사(FAIL 지적 2번) — 비용(maint/fuel/misc)은 canonical expenses 배열에서 읽는다
    // (record.maintItems/fuelItems/miscItems가 아니라). FIXTURE_EXPENSES는 FIXTURE_WORK의 같은
    // 필드와 같은 금액으로 맞춰 뒀다(finance.fixtures.js) — 아래 합계는 그 금액 기준이다.
    const ours = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
    assert.equal(ours.tripCount, 4)
    assert.equal(ours.vatAmount, 66000)
    assert.equal(ours.netProfit, 514000)
    assert.equal(ours.income.total, 652000)
    assert.equal(ours.income.fare.total, 660000)
    assert.equal(ours.income.commission.total, 13000)
    assert.equal(ours.income.fuelSubsidy.total, 5000)
    assert.equal(ours.expense.total, 138000)
    assert.equal(ours.unpaid.total, 130000)
    assert.equal(ours.distanceKm, 40)
    assert.equal(ours.durationHours, 3)
  })

  test('기사 정산 합계', () => {
    const car = FIXTURE_SETTINGS.cars[1]
    const link = FIXTURE_SETTINGS.driverLinks[0]
    const data = FIXTURE_WORK['서울12가3456']
    const ours = getLinkedDriverSettlementDetail(data, MONTH_KEY, link, car)
    // 운송료 450,000 − 수수료 15%(67,500) − 산재 3,000 = 379,500
    assert.equal(ours.totalFare, 450000)
    assert.equal(ours.tripCount, 2)
    assert.equal(ours.commissionAmount, 67500)
    assert.equal(ours.insuranceAmount, 3000)
    assert.equal(ours.finalAmount, 379500)
  })

  test('세금계산서 그룹 금액', () => {
    // 세액은 공급가의 10%, 합계는 공급가+세액
    const expected = {
      sales: [
        { supplyAmount: 630000, taxAmount: 63000, totalAmount: 693000, count: 5 },
        { supplyAmount: 200000, taxAmount: 20000, totalAmount: 220000, count: 1 },
        { supplyAmount: 250000, taxAmount: 25000, totalAmount: 275000, count: 1 },
        // 부산33나1111(옛 "기사 직접 정산" 시험값)도 기사차량 운행분이라 늘 포함(2026-10-02 계산서 처리 방식 삭제)
        { supplyAmount: 80000, taxAmount: 8000, totalAmount: 88000, count: 1 },
      ],
    }
    for (const flow of /** @type {const} */ (['sales'])) {
      const ours = getTaxInvoiceSourceGroups(MONTH_KEY, flow, FIXTURE_SETTINGS, FIXTURE_WORK)
      assert.equal(ours.length, expected[flow].length, flow)
      ours.forEach((group, index) => {
        assert.equal(group.supplyAmount, expected[flow][index].supplyAmount, `${flow} supply`)
        assert.equal(group.taxAmount, expected[flow][index].taxAmount, `${flow} tax`)
        assert.equal(group.totalAmount, expected[flow][index].totalAmount, `${flow} total`)
        assert.equal(group.count, expected[flow][index].count, `${flow} count`)
      })
    }
  })

  test('미수금 잔액', () => {
    const ours = getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK)
    assert.deepEqual(ours.map((item) => item.remainingAmount), [100000, 0, 20000, 10000, 200000, 999999, 80000])
    // 기준일 2026-08-25에 입금 예정일이 지난 미수 건수(옛 "숫자 비교표" 테스트에서 옮겨 옴)
    assert.equal(getOverdueReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK, new Date('2026-08-25')).length, 1)
  })

  test('수수료 경계: 운행 0건이면 건당 수수료 0', () => {
    const car = { commEnabled: true, commType: 'direct', commission: '20,000' }
    assert.equal(calculateDriverVehicleCommission(car, 0, 0), 0)
    assert.equal(calculateDriverVehicleCommission(car, 0, 3), 60000)
  })

  test('거래처 운임 수수료 스냅샷', () => {
    const fare = 100000
    const withSnap = { commissionSnapshot: { enabled: true, type: 'direct', value: '7,000' }, client: '한진' }
    const withoutSnap = { client: '한진' }
    // 스냅샷이 있으면 그 값(7,000), 없으면 거래처 설정 10%(10,000)
    assert.equal(getCallDetailCommissionAmount(withSnap, fare, FIXTURE_SETTINGS), 7000)
    assert.equal(getCallDetailCommissionAmount(withoutSnap, fare, FIXTURE_SETTINGS), 10000)
  })

  test('할당 기간 밖은 기사 정산에 안 넣음', () => {
    const link = FIXTURE_SETTINGS.driverLinks[0]
    const ours = getMonthlyDriverTotals(FIXTURE_WORK['서울12가3456'], MONTH_KEY, link)
    same(ours, { grossAmount: 450000, insuranceAmount: 3000, count: 2 })
    assert.equal(ours.grossAmount < 999999, true)
  })

  // 2026-09-17: 실제 day record는 fare 필드를 안 저장한다(고정노선은 fixedCount만,
  // saveDayRecord). FIXTURE_WORK['서울12가3456']는 fare:250000이 같이 박혀 있어
  // (레거시 픽스처 모양) 이 버그를 못 잡았다 — settings 없이 부르면(4번째 인자 생략)
  // 예전과 동일하게 0인 채로 남아야 하고(하위호환), settings를 넘기면 고정노선분이
  // 잡혀야 한다.
  test('fare 필드 없는 실제 고정노선 기록 — settings 없으면 0, 있으면 단가×횟수로 잡힘', () => {
    const realisticData = { '2026-05-12': { isOff: false, fixedCount: 1 } }
    const withoutSettings = getMonthlyDriverTotals(realisticData, MONTH_KEY, null)
    assert.equal(withoutSettings.grossAmount, 0, 'settings 없이는 하위호환으로 0')
    const withSettings = getMonthlyDriverTotals(realisticData, MONTH_KEY, null, FIXTURE_SETTINGS)
    assert.equal(withSettings.grossAmount, 250000, 'fixedUnitPrice(250,000) × 1건')
    assert.equal(withSettings.count, 1)
  })
})

// Step 6 재감사(FAIL 지적 2번) — 비용 단일 계약: canonical expenses가 정본이고,
// record.maintItems/fuelItems/miscItems는 더 이상 안 읽는다(이중 저장 금지).
describe('getOwnerMonthlyFinanceDetail — 비용은 canonical expenses에서만 읽는다', () => {
  test('record.maintItems/fuelItems/miscItems가 있어도 무시하고 expenses만 합산한다(중복 0건)', () => {
    // FIXTURE_WORK.main['2026-05-10']에는 여전히 maintItems(30,000)/fuelItems(80,000)/
    // miscItems(8,000)가 박혀 있다 — 클라우드 hydrate가 채우는 값과 같은 모양을 흉내낸
    // 것이다. FIXTURE_EXPENSES는 일부러 "다른" 금액을 주고, 결과가 expenses 쪽
    // 금액과만 일치하는지(=record 쪽을 더해서 두 배가 되지 않는지) 확인한다.
    const differentExpenses = [{ id: 'x1', kind: 'maint', date: '2026-05-10', name: '오일', cost: 11111 }]
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, differentExpenses)
    assert.equal(detail.expense.maint.total, 11111, 'expenses 쪽 금액만 반영돼야 한다')
    assert.notEqual(detail.expense.maint.total, 30000 + 11111, 'record.maintItems와 합산돼서 중복 계산되면 안 된다')
  })

  test('expenses가 비어 있으면(로컬 편집이 아직 없음) 비용은 0이다 — record 쪽을 fallback으로 쓰지 않는다', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    assert.equal(detail.expense.total, 0)
    assert.equal(detail.income.fuelSubsidy.total, 0)
  })

  test('월이 다른 expenses 항목은 제외된다', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, [
      { id: 'other-month', kind: 'maint', date: '2026-06-01', name: '엉뚱한 달', cost: 99999 },
    ])
    assert.equal(detail.expense.total, 0)
  })

  test('일지에서 방금 추가한 비용이 즉시 반영된다(새로고침 없이) — expenses 배열에 넣기만 하면 된다', () => {
    // useExpenseForm.js의 save()가 하는 일과 동일하게, expenses 배열에 새 항목을
    // 추가하는 것만으로 다음 getOwnerMonthlyFinanceDetail 호출에 바로 잡혀야 한다
    // (별도의 hydrate/새로고침 없이) — 이게 "즉시 반영" 요구사항의 핵심이다.
    const before = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    assert.equal(before.expense.misc.total, 0)
    const afterAdd = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, [
      { id: 'new-1', kind: 'misc', date: '2026-05-15', name: '주차비', cost: 5000 },
    ])
    assert.equal(afterAdd.expense.misc.total, 5000)
    assert.equal(afterAdd.netProfit, before.netProfit - 5000)
  })

  // 재감사 2차(FAIL 지적 3번) — expenses는 차량 구분이 없는 소유자 전체 배열인데,
  // scope==='driver'(기사 손익) 화면에도 그대로 합산되던 오염을 잡는다. FIXTURE_WORK의
  // 기사 차량('서울12가3456')에는 애초에 비용 데이터가 없으므로, "오너 expenses가
  // 기사 화면에 안 새는지"는 이 테스트로만 드러난다(기존 owner-scope 테스트들은 이
  // 경로를 안 지난다).
  test('scope=driver(기사 손익)에는 오너의 expenses가 섞여 들어가면 안 된다', () => {
    const ownerExpenses = [{ id: 'owner-only', kind: 'maint', date: '2026-05-10', name: '오너 정비', cost: 50000 }]
    const driverDetail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'driver', FIXTURE_SETTINGS, FIXTURE_WORK, ownerExpenses)
    assert.equal(driverDetail.expense.maint.total, 0, '기사 손익에는 오너의 정비 비용이 들어가면 안 된다')
    assert.equal(driverDetail.expense.fuel.total, 0, '기사 손익에는 오너의 주유 비용이 들어가면 안 된다')
    assert.equal(driverDetail.expense.misc.total, 0, '기사 손익에는 오너의 기타 비용이 들어가면 안 된다')
    const ownerDetail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, ownerExpenses)
    assert.equal(ownerDetail.expense.total, 50000, '같은 expenses가 owner 화면에는 정상 반영돼야 한다(비교용)')
  })
})

describe('getOwnerMonthlyFinanceDetail — driverExpenses 버킷(Q1)', () => {
  const ownerOnly = [{ id: 'own-m', kind: 'maint', date: '2026-05-10', name: '차주', cost: 10000 }]
  const driverOnly = [
    { id: 'drv-m', kind: 'maint', date: '2026-05-10', name: '기사', cost: 30000, vehicleNumber: '서울12가3456' },
    { id: 'drv-f', kind: 'fuel', date: '2026-05-10', fuelType: '주유', cost: 20000, subsidy: 4000, liters: 10, vehicleNumber: '서울12가3456' },
  ]

  test('owner=expenses만, driver=driverExpenses만, all=합(+subsidy 동일)', () => {
    const owner = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, ownerOnly, driverOnly)
    assert.equal(owner.expense.maint.total, 10000)
    assert.equal(owner.expense.fuel.total, 0)
    assert.equal(owner.income.fuelSubsidy.total, 0)

    const driver = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'driver', FIXTURE_SETTINGS, FIXTURE_WORK, ownerOnly, driverOnly)
    assert.equal(driver.expense.maint.total, 30000)
    assert.equal(driver.expense.fuel.total, 20000)
    assert.equal(driver.income.fuelSubsidy.total, 4000)

    const all = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'all', FIXTURE_SETTINGS, FIXTURE_WORK, ownerOnly, driverOnly)
    assert.equal(all.expense.maint.total, 40000)
    assert.equal(all.expense.fuel.total, 20000)
    assert.equal(all.income.fuelSubsidy.total, 4000)
  })
})

describe('getOwnerMonthlyFinanceDetail — 월급제 기사 급여', () => {
  const salaryAmount = 2000000
  // 산재 규칙 재설계(로드맵 4-2): 기사 정산액 전체가 지출이고, 산재보험료는 정산액 기준 월 단위로 따로 계산해 차주 몫만 더한다.
  /** 픽스처 김기사(매출제 15%): 450000×15% = 67500 — 산재를 빼지 않은 기사 정산액 전체 */
  const revenueShareAmount = 67500
  /** 김기사 산재(경비율 30.5%·요율 1.8%, 적용 ON): 월보수액 46913 → 총액 844 → 차주 몫 422 */
  const kimInsuranceOwner = 422
  /** 박기사 월급제 2,000,000 산재(적용 꺼짐): 월보수액 1,390,000 → 총액 25,020 전부 차주 몫 */
  const parkInsuranceOwner = 25020
  const salaryCarNumber = '부산33나1111'

  test("scope='owner'에서는 salary가 0으로 제외된다", () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
    assert.equal(detail.expense.salary.total, 0)
  })

  test("scope='driver'/'all'에서는 월급제+매출제 정산이 expense.salary.total·netProfit에 반영된다", () => {
    for (const scope of ['driver', 'all']) {
      const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, scope, FIXTURE_SETTINGS, FIXTURE_WORK, [])
      const withoutSalaryCar = getOwnerMonthlyFinanceDetail(MONTH_KEY, scope, {
        ...FIXTURE_SETTINGS,
        cars: FIXTURE_SETTINGS.cars.map((car) => (
          car.number === salaryCarNumber
            ? { ...car, driverPayMode: 'revenue', driverSalaryAmount: '', commEnabled: false, commission: '' }
            : car
        )),
      }, FIXTURE_WORK, [])
      assert.equal(detail.expense.salary.total, salaryAmount + revenueShareAmount + kimInsuranceOwner + parkInsuranceOwner, scope)
      assert.equal(detail.netProfit, withoutSalaryCar.netProfit - (salaryAmount + parkInsuranceOwner), scope)
    }
  })

  test('월급제→매출제 전환 시 고정급은 빠지고 % 정산만 남는다', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'driver', {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === salaryCarNumber
          ? { ...car, driverPayMode: 'revenue', driverSalaryAmount: '', commEnabled: false, commission: '' }
          : car
      )),
    }, FIXTURE_WORK, [])
    assert.equal(detail.expense.salary.total, revenueShareAmount + kimInsuranceOwner)
    assert.equal(detail.expense.salary.items.length, 2)
    assert.deepEqual(detail.expense.salary.items.map((i) => i.label), ['김기사', '김기사 산재보험(차주 부담)'])
  })

  test('급여액이 0 이하면 월급 항목은 제외된다(매출제 정산은 유지)', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'driver', {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === salaryCarNumber ? { ...car, driverSalaryAmount: '0' } : car
      )),
    }, FIXTURE_WORK, [])
    assert.equal(detail.expense.salary.total, revenueShareAmount + kimInsuranceOwner)
    assert.ok(detail.expense.salary.items.every((i) => !i.label.startsWith('박기사')), '월급 0이면 산재 항목도 없다')
  })

  test('salary 항목에 월급제·매출제 기사 label과 산재 차주 부담 항목이 각각 들어간다', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'driver', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    assert.equal(detail.expense.salary.items.length, 4)
    const labels = detail.expense.salary.items.map((i) => i.label).sort()
    assert.deepEqual(labels, ['김기사', '김기사 산재보험(차주 부담)', '박기사', '박기사 산재보험(차주 부담)'])
  })
})

describe('입금예정일', () => {
  // 2026-09-01 보리 지시로 기사 할당 "기간 겹침" 계산을 제거했다 — assignmentRangesOverlap
  // / findOverlappingDriverLink 원본 대조 테스트도 그 기능과 함께 삭제한다.
  test('calculatePaymentDueDate', () => {
    // [결제일, 주기, 값, 기대 입금예정일] — 말일이 없는 달은 그 달 말일로 맞춘다
    const cases = [
      ['2026-01-31', 'next_month_end', '', '2026-02-28'],
      ['2026-01-31', 'second_month_end', '', '2026-03-31'],
      ['2026-01-31', 'next_month_day', '31', '2026-02-28'],
      ['2026-01-31', 'second_month_day', '31', '2026-03-31'],
      ['2026-05-01', 'after_days', '10', '2026-05-11'],
      ['2026-05-01', 'same_day', '', '2026-05-01'],
      ['2026-05-10', 'next_month_end', '', '2026-06-30'],
    ]
    for (const [date, cycle, value, expected] of cases) {
      assert.equal(calculatePaymentDueDate(date, cycle, value), expected, String([date, cycle, value]))
    }
  })
})

// 미연동 고정노선 슬라이스(2026-09-19) — 차주 집계(월 매출·손익 상세·세금계산서)가 서브차량
// 소스별로 그 차량 스코프 고정노선을 먼저 쓰고, 없으면 차주 것으로 fallback한다.
describe('서브차량 스코프 고정노선 — 차주 집계', () => {
  const SUB_PLATE = '서울12가3456'
  const scopedClient = {
    id: 'client-sub-fx', companyName: '서브고정', fixedRouteLinked: true,
    fixedUnitPrice: '100,000', scopedToVehicleNumber: SUB_PLATE,
  }
  const withScoped = { ...FIXTURE_SETTINGS, clients: [...FIXTURE_SETTINGS.clients, scopedClient] }
  const otherPlateScoped = {
    ...FIXTURE_SETTINGS,
    clients: [...FIXTURE_SETTINGS.clients, { ...scopedClient, scopedToVehicleNumber: '부산33나1111' }],
  }
  /** @param {ReturnType<typeof getMonthlyFareRevenue>} result @param {string} logId */
  const vehicleFare = (result, logId) => {
    const item = result.byVehicle.find((entry) => entry.logId === logId)
    assert.ok(item, `${logId} 소스가 있어야 한다`)
    return item.fare
  }

  test('월 매출: 서브차량은 자기 스코프 단가(100,000), 메인은 차주 단가 그대로', () => {
    const base = getMonthlyFareRevenue(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    const scoped = getMonthlyFareRevenue(MONTH_KEY, withScoped, FIXTURE_WORK)
    assert.equal(vehicleFare(scoped, 'main'), vehicleFare(base, 'main'))
    assert.equal(vehicleFare(scoped, SUB_PLATE), vehicleFare(base, SUB_PLATE) - 150000, '고정 1건: 250,000 → 100,000')
    assert.equal(scoped.totalFare, base.totalFare - 150000)
  })

  test('월 매출: 다른 차량 스코프 고정노선은 무시하고 차주 단가로 fallback(기존과 동일)', () => {
    same(
      getMonthlyFareRevenue(MONTH_KEY, otherPlateScoped, FIXTURE_WORK),
      getMonthlyFareRevenue(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK),
    )
  })

  test('차주 상세 손익(all): 서브 고정노선은 스코프 거래처명·금액, 메인 거래처 금액은 그대로', () => {
    const amountOf = (/** @type {ReturnType<typeof getOwnerMonthlyFinanceDetail>} */ detail, /** @type {string} */ label) => (
      detail.income.fare.items.find((item) => item.label === label)?.amount
    )
    const ownerDetail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', withScoped, FIXTURE_WORK, [])
    const allDetail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'all', withScoped, FIXTURE_WORK, [])
    assert.equal(amountOf(allDetail, '서브고정'), 100000)
    assert.equal(amountOf(allDetail, '한진'), amountOf(ownerDetail, '한진'), '서브 고정분이 한진에 섞이면 안 됨')
  })

  test('세금계산서(매출): 서브차량 고정노선분은 스코프 거래처·100,000, 없으면 차주 거래처·250,000', () => {
    const findGroup = (/** @type {ReturnType<typeof getTaxInvoiceSourceGroups>} */ groups, /** @type {string} */ key) => groups.find((group) => group.partyKey === key)
    const scoped = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', withScoped, FIXTURE_WORK)
    assert.equal(findGroup(scoped, `서브고정__${SUB_PLATE}`)?.supplyAmount, 100000)
    assert.equal(findGroup(scoped, `한진__${SUB_PLATE}`), undefined)
    const base = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)
    assert.equal(findGroup(base, `한진__${SUB_PLATE}`)?.supplyAmount, 250000)
  })
})
