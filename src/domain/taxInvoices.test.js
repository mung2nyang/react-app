import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getTaxInvoiceRecordId } from './finance.js'
import { MONTH_KEY } from './finance.fixtures.js'
import {
  applyInsertedTaxInvoiceId,
  buildTaxInvoiceRow,
  mergeTaxInvoiceRecords,
  parseEntityNumber,
  resolveTaxInvoiceVehicleId,
  matchTaxInvoiceClientId,
} from './taxInvoices.js'

const ORIGINAL_COLUMNS = ['user_id', 'vehicle_id', 'client_id', 'flow', 'month_key', 'supply_amount', 'tax_amount', 'total_amount', 'status', 'raw']

const CARS = [
  { type: 'main', number: '서울00가0000', supabaseId: 'veh-main' },
  { type: 'sub', number: '서울12가3456', supabaseId: 'veh-sub' },
  { type: 'sub', number: '부산33나1111' },
]

describe('tax_invoices — 원본 finance-sync 컬럼·upsert 매핑', () => {
  test('원본 parseEntityNumber와 같이 콤마 금액을 숫자로 바꾼다', () => {
    assert.equal(parseEntityNumber('630,000'), 630000)
    assert.equal(parseEntityNumber('63,000'), 63000)
    assert.equal(parseEntityNumber(''), 0)
  })

  test('원본 insert 행에 daily_log_id/work_date/sequence가 없고 10개 컬럼만 있다', () => {
    const item = {
      id: getTaxInvoiceRecordId(MONTH_KEY, '한진', 'sales'),
      flow: 'sales',
      monthKey: MONTH_KEY,
      clientName: '한진',
      supplyAmount: '630,000',
      taxAmount: '63,000',
      totalAmount: '693,000',
      status: 'draft',
    }
    const row = buildTaxInvoiceRow(item, { userId: 'user-1', vehicleId: 'veh-main', clientId: 'cli-1' })
    assert.deepEqual(Object.keys(row), ORIGINAL_COLUMNS)
    assert.equal(row.daily_log_id, undefined)
    assert.equal(row.work_date, undefined)
    assert.equal(row.sequence, undefined)
    assert.equal(row.supply_amount, 630000)
    assert.equal(row.tax_amount, 63000)
    assert.equal(row.total_amount, 693000)
    assert.equal(row.status, 'draft')
    assert.equal(row.raw.id, 'sales|2026-05|한진')
  })

  test('vehicle_id는 carNumber, 없으면 vehicleNumbers[0], 둘 다 없으면 메인 차량이다', () => {
    assert.equal(resolveTaxInvoiceVehicleId({ carNumber: '서울12가3456' }, { cars: CARS }), 'veh-sub')
    assert.equal(resolveTaxInvoiceVehicleId({ vehicleNumbers: ['서울12가3456'] }, { cars: CARS }), 'veh-sub')
    assert.equal(resolveTaxInvoiceVehicleId({ vehicleNumbers: [] }, { cars: CARS }), 'veh-main')
    assert.equal(resolveTaxInvoiceVehicleId({}, { cars: CARS }), 'veh-main')
  })

  test('차량 행이 아직 서버에 없으면 null을 돌려 재시도 여지를 남긴다', () => {
    assert.equal(resolveTaxInvoiceVehicleId({ carNumber: '부산33나1111' }, { cars: CARS }), null)
    assert.equal(resolveTaxInvoiceVehicleId({ carNumber: '없는차' }, { cars: CARS }), null)
  })

  test('client_id는 거래처 이름(companyName)으로 매칭한다', () => {
    const clients = [{ companyName: '한진', supabaseId: 'cli-hanjin' }, { companyName: '대한' }]
    assert.equal(matchTaxInvoiceClientId({ clientName: '한진' }, clients), 'cli-hanjin')
    assert.equal(matchTaxInvoiceClientId({ clientName: '대한' }, clients), null)
    assert.equal(matchTaxInvoiceClientId({ clientName: '없는곳' }, clients), null)
  })

  test('insert 성공 id를 붙이면 다음 저장은 update 경로로 간다', () => {
    const records = [{ id: 'sales|2026-05|한진', status: 'draft' }]
    const next = applyInsertedTaxInvoiceId(records, 'sales|2026-05|한진', 'inv-1')
    assert.equal(next[0].supabaseId, 'inv-1')
    assert.equal(records[0].supabaseId, undefined)
  })

  test('불러오기는 id 기준 합치고, 서버에 없는 로컬 초안은 남긴다', () => {
    const local = [
      { id: 'sales|2026-05|한진', status: 'draft', note: 'local' },
      { id: 'sales|2026-05|초안만', status: 'draft' },
    ]
    const rows = [
      { id: 'inv-1', raw: { id: 'sales|2026-05|한진', status: 'issued', supplyAmount: 630000 } },
      { id: 'inv-2', raw: {} },
    ]
    const merged = mergeTaxInvoiceRecords(local, rows)
    assert.equal(merged.find((item) => item.id === 'sales|2026-05|한진')?.status, 'issued')
    assert.equal(merged.find((item) => item.id === 'sales|2026-05|한진')?.supabaseId, 'inv-1')
    assert.equal(merged.find((item) => item.id === 'sales|2026-05|초안만')?.status, 'draft')
    assert.equal(merged.length, 2)
  })
})
