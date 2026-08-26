import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculatePaymentDueDate } from './clients.js'
import {
  assignmentRangesOverlap,
  findOverlappingDriverLink,
  isDateWithinAssignment,
} from './drivers.js'
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
import { FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY, OVERLAP_LINKS } from './finance.fixtures.js'
import { parseCurrencyValue } from './money.js'
import { applyOriginalFixture, loadOriginalWindow } from './originalWindow.js'

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
    assert.equal(ours.totalFare, theirs.totalFare)
    assert.equal(ours.tripCount, theirs.tripCount)
    same(ours.byVehicle, theirs.byVehicle)
  })

  test('차주 월 손익', () => {
    const ours = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK)
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

describe('겹침 / 입금예정일', () => {
  test('assignmentRangesOverlap', () => {
    assert.equal(
      assignmentRangesOverlap('2026-05-01', '2026-05-31', '2026-05-15', '2026-06-15'),
      original.assignmentRangesOverlap('2026-05-01', '2026-05-31', '2026-05-15', '2026-06-15'),
    )
    assert.equal(
      assignmentRangesOverlap('2026-05-01', '2026-05-31', '2026-06-01', ''),
      original.assignmentRangesOverlap('2026-05-01', '2026-05-31', '2026-06-01', ''),
    )
    assert.equal(
      assignmentRangesOverlap('2026-05-01', '', '2026-12-01', '2026-12-31'),
      original.assignmentRangesOverlap('2026-05-01', '', '2026-12-01', '2026-12-31'),
    )
  })

  test('findOverlappingDriverLink', () => {
    const hit = findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-20', '2026-06-10')
    const originalHit = original.findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-20', '2026-06-10')
    assert.equal(hit?.id, originalHit?.id)
    assert.equal(
      findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-20', '2026-05-25', 'a')?.id,
      original.findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-05-20', '2026-05-25', 'a')?.id,
    )
    assert.equal(
      findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-07-01', '2026-07-31'),
      original.findOverlappingDriverLink(OVERLAP_LINKS, '서울12가3456', '2026-07-01', '2026-07-31'),
    )
  })

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
    const owner = getOwnerMonthlyFinanceDetail(MONTH_KEY, 'owner', FIXTURE_SETTINGS, FIXTURE_WORK)
    const driver = getLinkedDriverSettlementDetail(
      FIXTURE_WORK['서울12가3456'],
      MONTH_KEY,
      FIXTURE_SETTINGS.driverLinks[0],
      FIXTURE_SETTINGS.cars[1],
    )
    const sales = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)
    const purchase = getTaxInvoiceSourceGroups(MONTH_KEY, 'purchase', FIXTURE_SETTINGS, FIXTURE_WORK)
    const rows = [
      ['월 운송료 합계', revenue.totalFare, original.getMonthlyFareRevenue(MONTH_KEY).totalFare],
      ['월 운행 횟수', revenue.tripCount, original.getMonthlyFareRevenue(MONTH_KEY).tripCount],
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
