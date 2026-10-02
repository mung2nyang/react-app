import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculatePaymentDueDate } from './clients.js'
import {
  buildTaxInvoiceEntry,
  getDetailPaymentSummary,
  getReceivableItems,
  getTaxInvoicePartyInfo,
  getTaxInvoiceRecordId,
  getTaxInvoiceSourceGroups,
  listTaxInvoiceEntries,
} from './finance.js'
import { FIXTURE_DETAIL_ID_MAY10_MAIN, FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.js'
import { dueSoonItems, groupByClientMonth, groupItems } from './receivables.js'
import { addPartialPayment, markReceivableItemPaid } from './payments.js'
import { markMonthlyReceivablesPaid } from '../lib/ownerFinance.js'

/** @template T @param {T} a @param {T} b */
function same(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function groupSnapshot(items) {
  return groupByClientMonth(items).map((group) => ({
    client: group.client,
    monthKey: group.monthKey,
    total: group.total,
    count: group.count,
  }))
}

// 아래 기대값은 확정 규칙 기준 직접 값이다(2026-09에 원본 앱 대조에서 전환 — 그때 원본과 일치 확인된 값).
describe('미수금 — 운행 픽스처 확정 금액', () => {
  test('거래처+월 묶음 금액과 미수 행', () => {
    const ours = getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK)
    assert.equal(ours.length, 6)
    same(groupSnapshot(ours), [
      { client: '대한', monthKey: '2026-04', total: 999999, count: 1 },
      { client: '한진', monthKey: '2026-05', total: 130000, count: 4 },
      { client: '대한', monthKey: '2026-05', total: 200000, count: 1 },
    ])
    same(
      ours.map((item) => [item.client, item.workDate, item.remainingAmount, item.paymentDueDate]),
      [
        ['한진', '2026-05-10', 100000, '2026-04-01'],
        ['한진', '2026-05-10', 0, ''],
        ['한진', '2026-05-10', 20000, ''],
        ['한진', '2026-05-10', 10000, ''],
        ['대한', '2026-05-12', 200000, ''],
        ['대한', '2026-04-01', 999999, ''],
      ],
    )
  })

  test('입금 예정 D-3 필터', () => {
    const now = new Date('2026-08-25T00:00:00')
    const ours = dueSoonItems(getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK), now)
    same(ours.map((item) => item.remainingAmount), [100000])
  })

  test('상세 목록은 같은 거래처·월의 미수 건만 날짜순으로 둔다', () => {
    const ours = groupItems(getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK), '한진', '2026-05')
    same(ours.map((item) => item.fare), [100000, 0, 20000, 10000])
  })
})

describe('부분 입금 — payments 규칙', () => {
  test('남은 금액보다 큰 입금은 거절한다', () => {
    const result = addPartialPayment(clone(FIXTURE_WORK.main), '2026-05-10', FIXTURE_DETAIL_ID_MAY10_MAIN, '200,000')
    assert.equal(result.error, '남은 금액보다 큰 금액은 입력할 수 없습니다.')
  })

  test('부분 입금 후 remaining/status가 getDetailPaymentSummary와 같다', () => {
    const result = addPartialPayment(clone(FIXTURE_WORK.main), '2026-05-10', FIXTURE_DETAIL_ID_MAY10_MAIN, '40,000', '2026-08-25T00:00:00.000Z')
    const detail = result.data['2026-05-10'].callDetails.find((item) => item.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    const ours = getDetailPaymentSummary(detail)
    same(ours, { paidAmount: 40000, remainingAmount: 60000, status: 'partial' })
  })

  test('잔액 전액 입금하면 미수 목록에서 빠진다', () => {
    const paid = markReceivableItemPaid(clone(FIXTURE_WORK.main), '2026-05-10', FIXTURE_DETAIL_ID_MAY10_MAIN, '2026-08-25T00:00:00.000Z')
    const work = { ...clone(FIXTURE_WORK), main: paid.data }
    const ours = getReceivableItems(FIXTURE_SETTINGS, work)
    const detail = paid.data['2026-05-10'].callDetails.find((item) => item.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.equal(getDetailPaymentSummary(detail).status, 'paid')
    assert.equal(ours.some((item) => item.dateKey === '2026-05-10' && item.detailId === FIXTURE_DETAIL_ID_MAY10_MAIN), false)
  })

  test('월별 입금 완료는 해당 거래처·월 잔액을 0으로 만든다', () => {
    const next = markMonthlyReceivablesPaid(clone(FIXTURE_WORK), FIXTURE_SETTINGS, '한진', '2026-05', '2026-08-25T00:00:00.000Z')
    const leftover = getReceivableItems(FIXTURE_SETTINGS, next).filter((item) => item.client === '한진' && item.workDate.startsWith('2026-05'))
    assert.equal(leftover.reduce((sum, item) => sum + item.remainingAmount, 0), 0)
  })
})

describe('세금계산서 — 거래처 집계 확정 금액', () => {
  test('매출 그룹 공급가·세액·건수와 기록 ID', () => {
    const ours = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)
    const expected = [
      { clientName: '한진', supplyAmount: 630000, taxAmount: 63000, count: 5, recordId: 'sales|2026-05|한진__main' },
      { clientName: '대한', supplyAmount: 200000, taxAmount: 20000, count: 1, recordId: 'sales|2026-05|대한__서울12가3456' },
      { clientName: '한진', supplyAmount: 250000, taxAmount: 25000, count: 1, recordId: 'sales|2026-05|한진__서울12가3456' },
    ]
    assert.equal(ours.length, expected.length)
    ours.forEach((group, index) => {
      assert.equal(group.clientName, expected[index].clientName)
      assert.equal(group.supplyAmount, expected[index].supplyAmount)
      assert.equal(group.taxAmount, expected[index].taxAmount)
      assert.equal(group.count, expected[index].count)
      assert.equal(getTaxInvoiceRecordId(MONTH_KEY, group.partyKey, 'sales'), expected[index].recordId)
    })
  })

  test('거래처 사업자 정보 — 픽스처 거래처에 세무정보가 없으면 전부 빈 값', () => {
    const group = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)[0]
    same(getTaxInvoicePartyInfo(group, FIXTURE_SETTINGS), {
      clientBizNumber: '', clientRepresentative: '', clientAddress: '', clientBizType: '', clientBizItem: '', clientEmail: '',
    })
  })

  test('작성 전 목록 금액이 그룹 합계와 같다', () => {
    const { draftEntries } = listTaxInvoiceEntries(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    // 630,000 + 200,000 + 250,000
    assert.equal(draftEntries.reduce((sum, item) => sum + item.supplyAmount, 0), 1080000)
    const groups = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)
    const entry = buildTaxInvoiceEntry(groups[0], MONTH_KEY, 'sales', [], FIXTURE_SETTINGS)
    assert.equal(entry.supplyAmount, 630000)
    assert.equal(entry.status, 'draft')
  })
})

describe('입금 예정일', () => {
  test('거래처 결제 주기 계산', () => {
    assert.equal(calculatePaymentDueDate('2026-05-10', 'next_month_end', ''), '2026-06-30')
  })
})

test('세금계산서 정리 ②: logKey를 넘기면 그 차량 묶음만, 안 넘기면 전체 그대로', () => {
  const all = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)
  const keys = [...new Set(all.map((group) => group.partyKey.split('__').pop() || ''))]
  assert.ok(keys.length >= 2, '시험값에 메인·기사차량 묶음이 둘 다 있음')
  const byVehicle = keys.flatMap((key) => {
    const groups = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK, key)
    assert.ok(groups.every((group) => group.partyKey.endsWith(`__${key}`)), key)
    return groups
  })
  assert.deepEqual(byVehicle.map((group) => group.partyKey).sort(), all.map((group) => group.partyKey).sort())
})
