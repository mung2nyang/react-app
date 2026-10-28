// 기사 차량 번호를 바꾸면 그 차량 세금계산서도 새 번호로 옮겨, 그 뒤 계산서 저장이 되고 지난 발급 완료분이 새 번호 목록에 남는다.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { saveInvoices } = await import('./invoicesSave.ts')
const { requestVehicleSave } = await import('./vehicleMutations.ts')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration, getState } = await import('../store/app-store.ts')
const { commitCars, commitInvoices } = await import('../store/commitHelpers.ts')
const { listTaxInvoiceEntries } = await import('../../domain/financeTaxInvoiceEntries.ts')

const OLD = '34나5678'
const NEW = '56다7890'

/** @param {string} ownerKey */
function seedRenamable(ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.tax_invoices = { insert: () => ({ data: { id: 9101 }, error: null }), update: () => ({ data: null, error: null }) }
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
  const subCar = { id: 'car-sub', type: 'sub', number: OLD, supabaseId: 801, driverName: '김기사' }
  commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 700 }, subCar])
  // 번호 바꾸기 전에 서버에 저장된 그 기사 차량의 발급 완료 계산서와 메인 차량 계산서.
  commitInvoices(ownerKey, [
    {
      id: `sales|2026-09|한진__${OLD}`, supabaseId: 5001, flow: 'sales', monthKey: '2026-09', clientName: '한진', partyKey: `한진__${OLD}`,
      carNumber: OLD, logId: OLD, vehicleLabel: OLD, vehicleNumbers: [OLD], supplyAmount: 1, taxAmount: 0, totalAmount: 1, status: 'issued',
    },
    { id: 'sales|2026-09|대한__main', supabaseId: 5002, flow: 'sales', monthKey: '2026-09', clientName: '대한', partyKey: '대한__main', logId: 'fleet', supplyAmount: 1, taxAmount: 0, totalAmount: 1, status: 'issued' },
  ])
  return subCar
}

describe('기사 차량 번호 바꾸기 뒤 세금계산서', () => {
  afterEach(() => endCloudSession())

  test('번호를 앱에서 바꾼 뒤에도 세금계산서 저장이 된다', async () => {
    const ownerKey = 'renamed-car-save'
    const subCar = seedRenamable(ownerKey)

    const renamed = await requestVehicleSave({ ownerKey, cars: getState().cars[ownerKey], draft: { ...subCar, number: NEW }, editingId: 'car-sub', userId: ownerKey })
    assert.equal(renamed.failed, false, `차량 번호 바꾸기 실패: ${renamed.toast}`)

    const items = [
      ...(getState().invoices[ownerKey] || []),
      { id: 'sales|2026-10|대한__main', flow: 'sales', monthKey: '2026-10', clientName: '대한', supplyAmount: 100000, taxAmount: 10000, totalAmount: 110000, status: 'draft' },
    ]
    await assert.doesNotReject(() => saveInvoices(ownerKey, items))
    assert.equal(countOf('tax_invoices', 'update'), 2)
    assert.equal(countOf('tax_invoices', 'insert'), 1)
  })

  test('번호를 바꾸면 그 차량 계산서가 새 번호로, 발급 완료분이 새 번호 목록에 보이고 메인 계산서는 그대로', async () => {
    const ownerKey = 'renamed-car-list'
    const subCar = seedRenamable(ownerKey)

    await requestVehicleSave({ ownerKey, cars: getState().cars[ownerKey], draft: { ...subCar, number: NEW }, editingId: 'car-sub', userId: ownerKey })

    const records = getState().invoices[ownerKey] || []
    const moved = records.find((item) => item.supabaseId === 5001)
    assert.equal(moved?.id, `sales|2026-09|한진__${NEW}`)
    assert.equal(moved?.partyKey, `한진__${NEW}`)
    assert.equal(moved?.carNumber, NEW)
    assert.deepEqual(moved?.vehicleNumbers, [NEW])
    assert.equal(records.find((item) => item.supabaseId === 5002)?.id, 'sales|2026-09|대한__main')

    const listed = listTaxInvoiceEntries('2026-09', 'sales', { cars: getState().cars[ownerKey] }, {}, records, NEW)
    assert.deepEqual(listed.issuedEntries.map((item) => item.id), [`sales|2026-09|한진__${NEW}`])
  })
})
