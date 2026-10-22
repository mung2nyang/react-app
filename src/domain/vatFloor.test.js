// 로드맵 102 — 부가세는 공급가의 10%, 원 미만 버림(sot §4-14). 화면마다 같은 값인지 15,555원으로 본다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { vatOf } from './money.js'
import { callVatTotal } from './day-record.js'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.js'
import { getTaxInvoiceSourceGroups } from './financeTaxInvoiceGroups.js'

test('vatOf: 원 미만 버림, 10원 단위는 그대로', () => {
  assert.equal(vatOf(15555), 1555)
  assert.equal(vatOf(15559), 1555)
  assert.equal(vatOf(150000), 15000)
  assert.equal(vatOf(7), 0)
  assert.equal(vatOf(0), 0)
})

const WORK = { main: { '2026-09-02': { callDetails: [{ client: '한진', fare: '15,555' }, { client: '한진', fare: '15,555', vatExempt: true }] } } }

test('하루 화면 부가세(callVatTotal)도 버림, 면세는 0', () => {
  assert.equal(callVatTotal(WORK.main['2026-09-02']), 1555)
})

test('매출 부가세도 버림', () => {
  assert.equal(getOwnerMonthlyFinanceDetail('2026-09', 'owner', {}, WORK, []).vatAmount, 1555)
})

test('세금계산서 묶음 세액도 버림', () => {
  const groups = getTaxInvoiceSourceGroups('2026-09', 'sales', {}, WORK)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].taxAmount, 1555)
})
