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
import { FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from './finance.fixtures.js'
import { applyOriginalFixture, loadOriginalWindow } from '../lib/originalWindow.js'
import { dueSoonItems, groupByClientMonth, groupItems } from './receivables.js'
import { addPartialPayment, markReceivableItemPaid } from './payments.js'
import { markMonthlyReceivablesPaid } from '../lib/ownerFinance.js'

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

const original = loadOriginalWindow()
applyOriginalFixture(original, FIXTURE_SETTINGS, FIXTURE_WORK)

describe('미수금 — 원본과 같은 운행 픽스처', () => {
  test('거래처+월 묶음 금액이 원본 getReceivableItems와 같다', () => {
    const ours = getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK)
    const theirs = original.getReceivableItems()
    assert.equal(ours.length, theirs.length)
    same(groupSnapshot(ours), groupSnapshot(theirs))
    same(
      ours.map((item) => [item.client, item.workDate, item.remainingAmount, item.paymentDueDate]),
      theirs.map((item) => [item.client, item.workDate, item.remainingAmount, item.paymentDueDate]),
    )
  })

  test('입금 예정 D-3 필터가 원본과 같다', () => {
    const now = new Date('2026-08-25T00:00:00')
    const ours = dueSoonItems(getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK), now)
    const theirs = dueSoonItems(original.getReceivableItems(), now)
    same(
      ours.map((item) => item.remainingAmount),
      theirs.map((item) => item.remainingAmount),
    )
  })

  test('상세 목록은 같은 거래처·월의 미수 건만 날짜순으로 둔다', () => {
    const ours = groupItems(getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK), '한진', '2026-05')
    const theirs = groupItems(original.getReceivableItems(), '한진', '2026-05')
    same(ours.map((item) => item.fare), theirs.map((item) => item.fare))
  })
})

describe('부분 입금 — 원본 payments 규칙', () => {
  test('남은 금액보다 큰 입금은 거절한다', () => {
    const result = addPartialPayment(clone(FIXTURE_WORK.main), '2026-05-10', 0, '200,000')
    assert.equal(result.error, '남은 금액보다 큰 금액은 입력할 수 없습니다.')
  })

  test('부분 입금 후 remaining/status가 원본 getDetailPaymentSummary와 같다', () => {
    const result = addPartialPayment(clone(FIXTURE_WORK.main), '2026-05-10', 0, '40,000', '2026-08-25T00:00:00.000Z')
    const detail = result.data['2026-05-10'].callDetails[0]
    const ours = getDetailPaymentSummary(detail)
    const theirs = original.getDetailPaymentSummary(detail)
    same(ours, theirs)
    assert.equal(ours.status, 'partial')
    assert.equal(ours.paidAmount, 40000)
    assert.equal(ours.remainingAmount, 60000)
  })

  test('잔액 전액 입금하면 미수 목록에서 빠진다', () => {
    const paid = markReceivableItemPaid(clone(FIXTURE_WORK.main), '2026-05-10', 0, '2026-08-25T00:00:00.000Z')
    const work = { ...clone(FIXTURE_WORK), main: paid.data }
    const ours = getReceivableItems(FIXTURE_SETTINGS, work)
    const detail = paid.data['2026-05-10'].callDetails[0]
    assert.equal(original.getDetailPaymentSummary(detail).status, 'paid')
    assert.equal(ours.some((item) => item.dateKey === '2026-05-10' && item.detailIndex === 0), false)
  })

  test('월별 입금 완료는 해당 거래처·월 잔액을 0으로 만든다', () => {
    const next = markMonthlyReceivablesPaid(clone(FIXTURE_WORK), FIXTURE_SETTINGS, '한진', '2026-05', '2026-08-25T00:00:00.000Z')
    const leftover = getReceivableItems(FIXTURE_SETTINGS, next).filter((item) => item.client === '한진' && item.workDate.startsWith('2026-05'))
    assert.equal(leftover.reduce((sum, item) => sum + item.remainingAmount, 0), 0)
  })
})

describe('세금계산서 — 원본과 같은 거래처 집계', () => {
  test('매출 그룹 공급가·세액·건수가 원본과 같다', () => {
    const ours = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)
    const theirs = original.getTaxInvoiceSourceGroups(MONTH_KEY, 'sales')
    assert.equal(ours.length, theirs.length)
    ours.forEach((group, index) => {
      assert.equal(group.clientName, theirs[index].clientName)
      assert.equal(group.supplyAmount, theirs[index].supplyAmount)
      assert.equal(group.taxAmount, theirs[index].taxAmount)
      assert.equal(group.count, theirs[index].count)
      assert.equal(
        getTaxInvoiceRecordId(MONTH_KEY, group.partyKey, 'sales'),
        original.getTaxInvoiceRecordId(MONTH_KEY, group.partyKey, 'sales'),
      )
    })
  })

  test('거래처 사업자 정보가 원본 getTaxInvoicePartyInfo와 같다', () => {
    const group = getTaxInvoiceSourceGroups(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK)[0]
    same(getTaxInvoicePartyInfo(group, FIXTURE_SETTINGS), original.getTaxInvoicePartyInfo(group))
  })

  test('작성 전 목록 금액이 원본 그룹 합계와 같다', () => {
    const { draftEntries } = listTaxInvoiceEntries(MONTH_KEY, 'sales', FIXTURE_SETTINGS, FIXTURE_WORK, [])
    const theirs = original.getTaxInvoiceSourceGroups(MONTH_KEY, 'sales')
    assert.equal(draftEntries.reduce((sum, item) => sum + item.supplyAmount, 0), theirs.reduce((sum, item) => sum + item.supplyAmount, 0))
    const entry = buildTaxInvoiceEntry(theirs[0], MONTH_KEY, 'sales', [], FIXTURE_SETTINGS)
    assert.equal(entry.supplyAmount, theirs[0].supplyAmount)
    assert.equal(entry.status, 'draft')
  })
})

describe('입금 예정일', () => {
  test('거래처 결제 주기 계산이 원본과 같다', () => {
    assert.equal(
      calculatePaymentDueDate('2026-05-10', 'next_month_end', ''),
      original.calculatePaymentDueDate('2026-05-10', 'next_month_end', ''),
    )
  })
})
