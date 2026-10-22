// 저장된 세금계산서(33칸·공급자 사업자 정보) 검사의 통과/거부를 칸마다 못 박는다 — 검사 코드를 라이브러리로 바꿔도 결과가 같아야 한다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPersistedInvoice } from './persistDomainInvoice.js'

/** @typedef {import('../../domain/jsonTypes.ts').JsonValue} JsonValue */

const SUPPLIER = { sameAsOwner: false, name: '차주로지스', bizNumber: '123', representative: '대표', address: '서울', bizType: '운수', bizItem: '화물', email: 'a@b.c' }
const INVOICE = {
  id: 'inv-1', flow: 'sales', monthKey: '2026-10', status: 'issued', supabaseId: 7,
  supplyAmount: 100000, taxAmount: 10000, totalAmount: 110000, carNumber: '12가3456', vehicleNumbers: ['12가3456'],
  vehicleLabel: '메인', clientName: '한빛물류', clientBizNumber: '123-45-67890', clientRepresentative: '김대표',
  clientAddress: '서울', clientBizType: '운수', clientBizItem: '화물', clientEmail: 'tax@hanbit.kr',
  issueDate: '2026-10-17', itemName: '화물운송료', remark: '비고', updatedAt: '2026-10-17T00:00:00Z', issuedAt: '2026-10-17',
  partyKey: 'client:1', partyType: 'client', logId: 'main', count: 3, supplierBiz: SUPPLIER, supplierKey: 'owner',
  grossAmount: 1, commissionAmount: 2, insuranceAmount: 3, netAmount: 4,
}
const TEXT = ['monthKey', 'carNumber', 'vehicleLabel', 'clientName', 'clientBizNumber', 'clientRepresentative', 'clientAddress', 'clientBizType', 'clientBizItem', 'clientEmail', 'issueDate', 'itemName', 'remark', 'updatedAt', 'issuedAt', 'partyKey', 'logId', 'supplierKey']
const NUMBERS = ['supplyAmount', 'taxAmount', 'totalAmount', 'count', 'grossAmount', 'commissionAmount', 'insuranceAmount', 'netAmount']
/** 칸마다 틀린 값 — 손으로 적는다. @type {Array<[string, JsonValue]>} */
const BAD = [
  ['id', 1], ['flow', 'x'], ['status', 'x'], ['partyType', 'x'], ['supabaseId', true], ['supabaseId', null],
  ...TEXT.map((key) => /** @type {[string, JsonValue]} */ ([key, 1])),
  ...NUMBERS.map((key) => /** @type {[string, JsonValue]} */ ([key, '1'])),
  ['vehicleNumbers', 'x'], ['vehicleNumbers', [1]], ['vehicleNumbers', {}],
  ['supplierBiz', []], ['supplierBiz', null], ['supplierBiz', 'x'], ['supplierBiz', { sameAsOwner: 'no' }],
  ['supplierBiz', { name: 1 }], ['supplierBiz', { junk: 'a' }], ['supplierBiz', [SUPPLIER]],
]

test('33칸 모두 올바르면 통과, id만 있어도 통과', () => {
  assert.equal(isPersistedInvoice(INVOICE), true)
  assert.equal(isPersistedInvoice({ id: 'x' }), true)
})

test('칸마다 틀린 종류면 거부', () => {
  for (const [key, value] of BAD) assert.equal(isPersistedInvoice({ ...INVOICE, [key]: value }), false, `${key}=${JSON.stringify(value)}`)
})

test('모르는 칸, id 빠짐, 값이 비어 있는 칸, 객체가 아니면 거부', () => {
  assert.equal(isPersistedInvoice({ ...INVOICE, junk: 1 }), false)
  const noId = { ...INVOICE }
  Reflect.deleteProperty(noId, 'id')
  assert.equal(isPersistedInvoice(noId), false)
  for (const key of Object.keys(INVOICE)) {
    const copy = { ...INVOICE }
    Reflect.set(copy, key, undefined)
    assert.equal(isPersistedInvoice(copy), false, key)
  }
  for (const value of [null, [], [INVOICE], 'text', 3, true]) assert.equal(isPersistedInvoice(value), false, JSON.stringify(value))
})

test('숫자 칸: NaN·무한대 거부, 음수·소수 통과', () => {
  for (const key of [...NUMBERS, 'supabaseId']) {
    assert.equal(isPersistedInvoice({ ...INVOICE, [key]: Number.NaN }), false, `${key}=NaN`)
    assert.equal(isPersistedInvoice({ ...INVOICE, [key]: Number.POSITIVE_INFINITY }), false, `${key}=Infinity`)
    assert.equal(isPersistedInvoice({ ...INVOICE, [key]: -1.5 }), true, `${key}=-1.5`)
  }
})

test('통과해야 하는 경계 값', () => {
  for (const patch of [
    { flow: 'purchase' }, { flow: 'commission' }, { status: 'draft' }, { partyType: 'driver' }, { supabaseId: 'uuid' },
    { vehicleNumbers: [] }, { supplierBiz: {} }, { supplierBiz: { sameAsOwner: true } },
  ]) assert.equal(isPersistedInvoice({ ...INVOICE, ...patch }), true, JSON.stringify(patch))
})
