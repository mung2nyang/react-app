import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculatePaymentDueDate } from './clients.js'
import { isDateWithinAssignment } from './drivers.js'
import { getEffectiveDriverSettlementMode } from './cars.js'
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
import { applyOriginalFixture, loadOriginalWindow } from '../lib/originalWindow.js'

/** @template T @param {T} a @param {T} b */
function same(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b))
}

const original = loadOriginalWindow()
applyOriginalFixture(original, FIXTURE_SETTINGS, FIXTURE_WORK)

describe('원본 core-logic와 같은 입력', () => {
  test('parseCurrencyValue', () => {
    assert.equal(parseCurrencyValue('250,000'), original.parseCurrencyValue('250,000'))
    assert.equal(parseCurrencyValue(''), original.parseCurrencyValue(''))
    assert.equal(parseCurrencyValue(null), original.parseCurrencyValue(null))
    assert.equal(parseCurrencyValue(undefined), original.parseCurrencyValue(undefined))
    assert.equal(parseCurrencyValue(250000), original.parseCurrencyValue(250000))
    assert.equal(parseCurrencyValue('원'), original.parseCurrencyValue('원'))
  })

  test('isDateWithinAssignment', () => {
    const cases = [
      ['2026-05-15', '2026-05-01', '2026-05-31'],
      ['2026-04-30', '2026-05-01', '2026-05-31'],
      ['2026-06-01', '2026-05-01', '2026-05-31'],
      ['2026-05-01', '2026-05-01', '2026-05-31'],
      ['2026-05-31', '2026-05-01', '2026-05-31'],
      ['2020-01-01', '', '2026-05-31'],
      ['2099-01-01', '', ''],
    ]
    for (const args of cases) {
      assert.equal(isDateWithinAssignment(...args), original.isDateWithinAssignment(...args), String(args))
    }
  })

  test('getDetailPaymentSummary', () => {
    const samples = [
      { fare: '300,000', paymentStatus: '미수' },
      { fare: '300,000', paymentStatus: '수금 완료' },
      { fare: 300000, payments: [{ amount: 100000 }] },
      { fare: 300000, payments: [{ amount: 300000 }] },
      { fare: 300000, payments: [{ amount: 200000 }, { amount: 200000 }] },
    ]
    for (const detail of samples) {
        same(getDetailPaymentSummary(detail), original.getDetailPaymentSummary(detail))
    }
  })

  test('getEffectiveDriverSettlementMode', () => {
    assert.equal(
      getEffectiveDriverSettlementMode({ settlementMode: 'driver_direct' }, { defaultDriverSettlementMode: 'employee' }),
      original.getEffectiveDriverSettlementMode({ settlementMode: 'driver_direct' }, { defaultDriverSettlementMode: 'employee' }),
    )
    assert.equal(
      getEffectiveDriverSettlementMode({ settlementMode: 'default' }, { defaultDriverSettlementMode: 'employee' }),
      original.getEffectiveDriverSettlementMode({ settlementMode: 'default' }, { defaultDriverSettlementMode: 'employee' }),
    )
    assert.equal(
      getEffectiveDriverSettlementMode({ settlementMode: 'default' }, {}),
      original.getEffectiveDriverSettlementMode({ settlementMode: 'default' }, {}),
    )
    assert.equal(
      getEffectiveDriverSettlementMode({}, { defaultDriverSettlementMode: 'none' }),
      original.getEffectiveDriverSettlementMode({}, { defaultDriverSettlementMode: 'none' }),
    )
    assert.equal(
      getEffectiveDriverSettlementMode(null, { defaultDriverSettlementMode: 'employee' }),
      original.getEffectiveDriverSettlementMode(null, { defaultDriverSettlementMode: 'employee' }),
    )
    assert.equal(
      getEffectiveDriverSettlementMode(undefined, {}),
      original.getEffectiveDriverSettlementMode(undefined, {}),
    )
  })
})

describe('같은 운행 픽스처 — 원본 vs react-app', () => {
  test('월 운송료 합계', () => {
    const ours = getMonthlyFareRevenue(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    const theirs = original.getMonthlyFareRevenue(MONTH_KEY)
    // Step 9-B: isVehicleRevenueSharedWithOwner 단일 게이트 — shareRevenueWithOwner 서브차량은
    // settlementMode와 무관하게 포함(부산33나1111 운임 80,000·1회 추가).
    assert.equal(ours.totalFare, theirs.totalFare + 80000)
    assert.equal(ours.tripCount, theirs.tripCount + 1)
    assert.notEqual(JSON.stringify(ours.byVehicle), JSON.stringify(theirs.byVehicle))
  })

  test('차주 월 손익', () => {
    // 재감사(FAIL 지적 2번) — 비용(maint/fuel/misc)은 이제 canonical expenses 배열에서
    // 읽는다(record.maintItems/fuelItems/miscItems가 아니라). vanilla(theirs)는 여전히
    // day record에 박힌 필드를 읽으므로 입력 데이터 모양은 다르지만, FIXTURE_EXPENSES를
    // FIXTURE_WORK의 같은 필드와 같은 금액으로 맞춰 뒀기 때문에(finance.fixtures.js)
    // 합계는 여전히 같아야 한다 — 그 "숫자가 같다"만 확인한다(이건 계획적 이탈이지
    // 실수가 아니다).
    const ours = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
    const theirs = original.getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner')
    assert.equal(ours.tripCount, theirs.tripCount)
    assert.equal(ours.vatAmount, theirs.vatAmount)
    assert.equal(ours.netProfit, theirs.netProfit)
    assert.equal(ours.income.total, theirs.income.total)
    assert.equal(ours.income.fare.total, theirs.income.fare.total)
    assert.equal(ours.income.commission.total, theirs.income.commission.total)
    assert.equal(ours.income.fuelSubsidy.total, theirs.income.fuelSubsidy.total)
    assert.equal(ours.expense.total, theirs.expense.total)
    assert.equal(ours.unpaid.total, theirs.unpaid.total)
    assert.equal(ours.distanceKm, theirs.distanceKm)
    assert.equal(ours.durationHours, theirs.durationHours)
  })

  test('기사 정산 합계', () => {
    const car = FIXTURE_SETTINGS.cars[1]
    const link = FIXTURE_SETTINGS.driverLinks[0]
    const data = FIXTURE_WORK['서울12가3456']
    const ours = getLinkedDriverSettlementDetail(data, MONTH_KEY, link, car)
    const theirs = original.getLinkedDriverSettlementDetail(data, MONTH_KEY, link, car)
    assert.equal(ours.totalFare, theirs.totalFare)
    assert.equal(ours.tripCount, theirs.tripCount)
    assert.equal(ours.commissionAmount, theirs.commissionAmount)
    assert.equal(ours.insuranceAmount, theirs.insuranceAmount)
    assert.equal(ours.finalAmount, theirs.finalAmount)
  })

  test('세금계산서 그룹 금액', () => {
    for (const flow of ['sales', 'purchase', 'commission']) {
      const ours = getTaxInvoiceSourceGroups(MONTH_KEY, flow, FIXTURE_SETTINGS, FIXTURE_WORK)
      const theirs = original.getTaxInvoiceSourceGroups(MONTH_KEY, flow)
      assert.equal(ours.length, theirs.length, flow)
      ours.forEach((group, index) => {
        assert.equal(group.supplyAmount, theirs[index].supplyAmount, `${flow} supply`)
        assert.equal(group.taxAmount, theirs[index].taxAmount, `${flow} tax`)
        assert.equal(group.totalAmount, theirs[index].totalAmount, `${flow} total`)
        assert.equal(group.count, theirs[index].count, `${flow} count`)
      })
    }
  })

  test('미수금 잔액', () => {
    const ours = getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK)
    const theirs = original.getReceivableItems()
    assert.equal(ours.length, theirs.length)
    same(
      ours.map((item) => item.remainingAmount),
      theirs.map((item) => item.remainingAmount),
    )
  })

  test('수수료 경계: 운행 0건이면 건당 수수료 0', () => {
    const car = { commEnabled: true, commType: 'direct', commission: '20,000' }
    assert.equal(calculateDriverVehicleCommission(car, 0, 0), original.calculateDriverVehicleCommission(car, 0, 0))
    assert.equal(calculateDriverVehicleCommission(car, 0, 3), original.calculateDriverVehicleCommission(car, 0, 3))
  })

  test('거래처 운임 수수료 스냅샷', () => {
    const fare = 100000
    const withSnap = { commissionSnapshot: { enabled: true, type: 'direct', value: '7,000' }, client: '한진' }
    const withoutSnap = { client: '한진' }
    assert.equal(
      getCallDetailCommissionAmount(withSnap, fare, FIXTURE_SETTINGS),
      original.getCallDetailCommissionAmount(withSnap, fare, FIXTURE_SETTINGS),
    )
    assert.equal(
      getCallDetailCommissionAmount(withoutSnap, fare, FIXTURE_SETTINGS),
      original.getCallDetailCommissionAmount(withoutSnap, fare, FIXTURE_SETTINGS),
    )
  })

  test('할당 기간 밖은 기사 정산에 안 넣음', () => {
    const link = FIXTURE_SETTINGS.driverLinks[0]
    const ours = getMonthlyDriverTotals(FIXTURE_WORK['서울12가3456'], MONTH_KEY, link)
    const theirs = original.getMonthlyDriverTotals(FIXTURE_WORK['서울12가3456'], MONTH_KEY, link)
    same(ours, theirs)
    assert.equal(ours.grossAmount < 999999, true)
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
  /** 픽스처 김기사(매출제 15%, 산재 ON): 450000×15%−3000 */
  const revenueShareAmount = 64500
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
      assert.equal(detail.expense.salary.total, salaryAmount + revenueShareAmount, scope)
      assert.equal(detail.netProfit, withoutSalaryCar.netProfit - salaryAmount, scope)
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
    assert.equal(detail.expense.salary.total, revenueShareAmount)
    assert.equal(detail.expense.salary.items.length, 1)
    assert.equal(detail.expense.salary.items[0].label, '김기사')
  })

  test('급여액이 0 이하면 월급 항목은 제외된다(매출제 정산은 유지)', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'driver', {
      ...FIXTURE_SETTINGS,
      cars: FIXTURE_SETTINGS.cars.map((car) => (
        car.number === salaryCarNumber ? { ...car, driverSalaryAmount: '0' } : car
      )),
    }, FIXTURE_WORK, [])
    assert.equal(detail.expense.salary.total, revenueShareAmount)
    assert.ok(detail.expense.salary.items.every((i) => i.label !== '박기사'))
  })

  test('salary 항목에 월급제·매출제 기사 label이 각각 들어간다', () => {
    const detail = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'driver', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    assert.equal(detail.expense.salary.items.length, 2)
    const labels = detail.expense.salary.items.map((i) => i.label).sort()
    assert.deepEqual(labels, ['김기사', '박기사'])
  })
})

describe('입금예정일', () => {
  // 2026-09-01 보리 지시로 기사 할당 "기간 겹침" 계산을 제거했다 — assignmentRangesOverlap
  // / findOverlappingDriverLink 원본 대조 테스트도 그 기능과 함께 삭제한다.
  test('calculatePaymentDueDate', () => {
    const cases = [
      ['2026-01-31', 'next_month_end', ''],
      ['2026-01-31', 'second_month_end', ''],
      ['2026-01-31', 'next_month_day', '31'],
      ['2026-01-31', 'second_month_day', '31'],
      ['2026-05-01', 'after_days', '10'],
      ['2026-05-01', 'same_day', ''],
    ]
    for (const args of cases) {
      assert.equal(calculatePaymentDueDate(...args), original.calculatePaymentDueDate(...args), String(args))
    }
  })
})

describe('숫자 비교표용 스냅샷', () => {
  test('콘솔에 원본/연습앱 숫자를 같이 출력한다', () => {
    const revenue = getMonthlyFareRevenue(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)
    const owner = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK, FIXTURE_EXPENSES)
    const driver = getLinkedDriverSettlementDetail(
      FIXTURE_WORK['서울12가3456'],
      MONTH_KEY,
      FIXTURE_SETTINGS.driverLinks[0],
      FIXTURE_SETTINGS.cars[1],
    )
    const sales = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)
    const purchase = getTaxInvoiceSourceGroups(MONTH_KEY, 'purchase', FIXTURE_SETTINGS, FIXTURE_WORK)
    const rows = [
      ['월 운송료 합계', revenue.totalFare, original.getMonthlyFareRevenue(MONTH_KEY).totalFare + 80000],
      ['월 운행 횟수', revenue.tripCount, original.getMonthlyFareRevenue(MONTH_KEY).tripCount + 1],
      ['차주 순이익', owner.netProfit, original.getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner').netProfit],
      ['차주 부가세', owner.vatAmount, original.getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner').vatAmount],
      ['운임 수수료', owner.income.commission.total, original.getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner').income.commission.total],
      ['유가보조금', owner.income.fuelSubsidy.total, original.getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner').income.fuelSubsidy.total],
      ['운행 지출', owner.expense.total, original.getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner').expense.total],
      ['미입금 운송료', owner.unpaid.total, original.getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner').unpaid.total],
      ['기사 총 운송료', driver.totalFare, original.getLinkedDriverSettlementDetail(FIXTURE_WORK['서울12가3456'], MONTH_KEY, FIXTURE_SETTINGS.driverLinks[0], FIXTURE_SETTINGS.cars[1]).totalFare],
      ['기사 수수료', driver.commissionAmount, original.getLinkedDriverSettlementDetail(FIXTURE_WORK['서울12가3456'], MONTH_KEY, FIXTURE_SETTINGS.driverLinks[0], FIXTURE_SETTINGS.cars[1]).commissionAmount],
      ['기사 산재', driver.insuranceAmount, original.getLinkedDriverSettlementDetail(FIXTURE_WORK['서울12가3456'], MONTH_KEY, FIXTURE_SETTINGS.driverLinks[0], FIXTURE_SETTINGS.cars[1]).insuranceAmount],
      ['기사 정산액', driver.finalAmount, original.getLinkedDriverSettlementDetail(FIXTURE_WORK['서울12가3456'], MONTH_KEY, FIXTURE_SETTINGS.driverLinks[0], FIXTURE_SETTINGS.cars[1]).finalAmount],
      ['매출계산서 1번째 공급가', sales[0]?.supplyAmount ?? 0, original.getTaxInvoiceSourceGroups(MONTH_KEY, 'sales')[0]?.supplyAmount ?? 0],
      ['매출계산서 1번째 세액', sales[0]?.taxAmount ?? 0, original.getTaxInvoiceSourceGroups(MONTH_KEY, 'sales')[0]?.taxAmount ?? 0],
      ['매입계산서 공급가', purchase[0]?.supplyAmount ?? 0, original.getTaxInvoiceSourceGroups(MONTH_KEY, 'purchase')[0]?.supplyAmount ?? 0],
      ['연체 미수 건수', getOverdueReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK, new Date('2026-08-25')).length, original.getOverdueReceivableItems().length],
    ]
    console.log('\n비교표')
    console.log(['항목', '연습앱', '원본', '일치'].join('\t'))
    for (const [label, ours, theirs] of rows) {
      console.log([label, ours, theirs, ours === theirs ? '같음' : '다름'].join('\t'))
      assert.equal(ours, theirs, label)
    }
  })
})
