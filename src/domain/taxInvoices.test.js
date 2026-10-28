// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getTaxInvoiceRecordId } from './finance.ts'
import { MONTH_KEY } from './finance.fixtures.ts'
import {
  applyInsertedTaxInvoiceId,
  buildTaxInvoiceRow,
  mergeTaxInvoiceRecords,
  parseEntityNumber,
  resolveTaxInvoiceVehicleId,
  matchTaxInvoiceClientId,
  renameTaxInvoicePlate,
} from './taxInvoices.ts'

/** @typedef {import('./financeTaxInvoiceEntries.ts').InvoiceLike} InvoiceLike */
/** @typedef {import('./financeTypes.ts').CarLike} CarLike */

const ORIGINAL_COLUMNS = ['user_id', 'vehicle_id', 'client_id', 'flow', 'month_key', 'supply_amount', 'tax_amount', 'total_amount', 'status', 'raw']

/** @type {Array<CarLike>} */
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
    // 원본 finance-sync 행엔 이 3개 컬럼이 없다 — 부재를 명시적으로 검증(빌더 반환 타입엔 없어 loose 접근)
    const extraColumns = /** @type {Record<string, unknown>} */ (row)
    assert.equal(extraColumns.daily_log_id, undefined)
    assert.equal(extraColumns.work_date, undefined)
    assert.equal(extraColumns.sequence, undefined)
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
    /** @type {Array<InvoiceLike>} */
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

describe('renameTaxInvoicePlate — 서버 rename_sub_vehicle과 같은 규칙', () => {
  test('기사 차량 계산서는 번호가 든 7칸이 새 번호로(사업자명 있는 이름표 포함)', () => {
    /** @type {InvoiceLike} */
    const item = {
      id: 'sales|2026-10|테스터거래처__99가9998', partyKey: '테스터거래처__99가9998', carNumber: '99가9998', logId: '99가9998',
      vehicleLabel: '시험상사, 99가9998', supplierKey: 'car:99가9998:123-45-67890', vehicleNumbers: ['99가9998'], clientName: '테스터거래처', status: 'issued',
    }
    assert.deepEqual(renameTaxInvoicePlate(item, '99가9998', '99가0001'), {
      id: 'sales|2026-10|테스터거래처__99가0001', partyKey: '테스터거래처__99가0001', carNumber: '99가0001', logId: '99가0001',
      vehicleLabel: '시험상사, 99가0001', supplierKey: 'car:99가0001:123-45-67890', vehicleNumbers: ['99가0001'], clientName: '테스터거래처', status: 'issued',
    })
  })

  test('번호만 있는 이름표·차주 공급자 키는 이름표만 바뀐다', () => {
    /** @type {InvoiceLike} */
    const item = { id: 'sales|2026-09|한진__99가9998', partyKey: '한진__99가9998', carNumber: '99가9998', vehicleLabel: '99가9998', supplierKey: 'owner:111' }
    const next = renameTaxInvoicePlate(item, '99가9998', '99가0001')
    assert.equal(next.vehicleLabel, '99가0001')
    assert.equal(next.supplierKey, 'owner:111')
  })

  test('메인·다른 기사 차량 계산서는 같은 객체 그대로', () => {
    /** @type {InvoiceLike} */
    const main = { id: 'sales|2026-10|테스터거래처__main', partyKey: '테스터거래처__main', logId: 'fleet', vehicleLabel: '메인 차량', supplierKey: 'owner:111', vehicleNumbers: [] }
    /** @type {InvoiceLike} */
    const other = { id: 'sales|2026-10|한진__22가2222', partyKey: '한진__22가2222', carNumber: '22가2222', vehicleNumbers: ['22가2222'] }
    assert.equal(renameTaxInvoicePlate(main, '99가9998', '99가0001'), main)
    assert.equal(renameTaxInvoicePlate(other, '99가9998', '99가0001'), other)
  })
})
