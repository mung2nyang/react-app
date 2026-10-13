import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getFixedRouteCommissionAmount } from './fixedRouteCommission.js'
import { monthSettlementSummary } from './monthSettlement.js'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.js'

describe('getFixedRouteCommissionAmount — 고정노선 거래처 수수료(로드맵 39)', () => {
  test('비율: 그날 금액에서 내림', () => {
    assert.equal(getFixedRouteCommissionAmount({ companyName: 'A', commEnabled: true, commType: 'percent', commValue: '10' }, 123455, 1), 12345)
  })

  test('종류가 비어 있으면 비율로 본다', () => {
    assert.equal(getFixedRouteCommissionAmount({ companyName: 'A', commEnabled: true, commValue: '5' }, 200000, 2), 10000)
  })

  test('정액: 그날 횟수만큼', () => {
    assert.equal(getFixedRouteCommissionAmount({ companyName: 'A', commEnabled: true, commType: 'direct', commValue: '3,000' }, 300000, 3), 9000)
  })

  test('꺼져 있거나 거래처가 없으면 0', () => {
    assert.equal(getFixedRouteCommissionAmount({ companyName: 'A', commEnabled: false, commType: 'percent', commValue: '10' }, 100000, 1), 0)
    assert.equal(getFixedRouteCommissionAmount(null, 100000, 1), 0)
  })

  test('비율 값이 숫자가 아니면 0(NaN 아님)', () => {
    assert.equal(getFixedRouteCommissionAmount({ companyName: 'A', commEnabled: true, commType: 'percent', commValue: '' }, 100000, 1), 0)
  })
})

describe('달력(monthSettlement)과 매출(financeOwnerDetail)의 고정노선 수수료가 같다(로드맵 39)', () => {
  const client = {
    id: 'c-fixed', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '275,000',
    commEnabled: true, commType: 'percent', commValue: '10',
  }
  const workData = {
    '2026-10-01': { fixedCount: 1 },
    '2026-10-02': { fixedCount: 1 },
  }

  test('같은 데이터면 수수료 합이 같고, 매출 거래처별 수수료에 고정노선 거래처로 잡힌다', () => {
    const calendar = monthSettlementSummary(workData, 2026, 9, {
      unitPrice: 275000, fixedRouteClient: client, activeFixedOn: true, clients: [client],
    })
    const revenue = getOwnerMonthlyFinanceDetail('2026-10', 'owner', { fixedOn: true, clients: [client], cars: [] }, { main: workData }, [])
    assert.equal(calendar.commissionTotal, 55000)
    assert.equal(revenue.income.commission.total, calendar.commissionTotal)
    assert.deepEqual(revenue.income.commission.items, [{ label: '한진', amount: 55000 }])
    assert.equal(revenue.income.total, revenue.income.fare.total - 55000)
  })

  test('수수료가 꺼진 고정노선 거래처는 두 화면 모두 0', () => {
    const off = { ...client, commEnabled: false }
    const calendar = monthSettlementSummary(workData, 2026, 9, {
      unitPrice: 275000, fixedRouteClient: off, activeFixedOn: true, clients: [off],
    })
    const revenue = getOwnerMonthlyFinanceDetail('2026-10', 'owner', { fixedOn: true, clients: [off], cars: [] }, { main: workData }, [])
    assert.equal(calendar.commissionTotal, 0)
    assert.equal(revenue.income.commission.total, 0)
  })
})
