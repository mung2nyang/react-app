// @ts-check
// 세금계산서(tax_invoices) 순수 계산 — 금액 파싱, 차량/거래처 id 해소, upsert 행 조립,
// 서버 행 병합. 실제 Supabase I/O는 lib/syncTaxInvoicesTable.js가, 하이드레이트 병합
// 호출은 lib/hydrate.js가 한다. 타입은 기존 InvoiceLike/CarLike 재사용.
/** @typedef {import('./financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('./financeTypes.js').CarLike} CarLike */

/**
 * @typedef {Object} TaxInvoiceItemInput buildTaxInvoiceRow가 읽는 필드만 — 실제로는 InvoiceLike가 넘어온다
 * @property {string} [id] raw로 저장돼 mergeTaxInvoiceRecords가 병합 키로 다시 읽는다
 * @property {string} [flow]
 * @property {string} [monthKey]
 * @property {number|string} [supplyAmount]
 * @property {number|string} [taxAmount]
 * @property {number|string} [totalAmount]
 * @property {string} [status]
 */

/**
 * @typedef {Object} TaxInvoiceRow tax_invoices 테이블 insert/update 행 (원본 finance-sync 10컬럼)
 * @property {string} user_id
 * @property {string|number|null} vehicle_id
 * @property {string|number|null} client_id
 * @property {string|null} flow
 * @property {string|null} month_key
 * @property {number} supply_amount
 * @property {number} tax_amount
 * @property {number} total_amount
 * @property {string} status
 * @property {TaxInvoiceItemInput} raw
 */

/** @param {unknown} value */
export function parseEntityNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export const TAX_INVOICE_VEHICLE_RETRY_ERROR = '차량 정보가 아직 서버에 등록되지 않았습니다. 잠시 후 다시 시도해 주세요.'

/**
 * @param {{ carNumber?: string|null, vehicleNumbers?: Array<string>|null }} item
 * @param {{ cars?: Array<CarLike> }} [settings]
 * @returns {string|number|null}
 */
export function resolveTaxInvoiceVehicleId(item, settings = {}) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const carNumber = item?.carNumber || (Array.isArray(item?.vehicleNumbers) ? item.vehicleNumbers[0] : null)
  if (carNumber) {
    const car = cars.find((entry) => entry.number === carNumber)
    return car?.supabaseId || null
  }
  const mainCar = cars.find((entry) => entry.type === 'main')
  return mainCar?.supabaseId || null
}

/**
 * @param {{ clientName?: string }} item
 * @param {Array<{ companyName?: string, supabaseId?: string|number }>} [clients]
 * @returns {string|number|null}
 */
export function matchTaxInvoiceClientId(item, clients = []) {
  const matched = (clients || []).find((client) => client.companyName === item?.clientName)
  return matched?.supabaseId || null
}

/**
 * @param {TaxInvoiceItemInput} item
 * @param {{ userId: string, vehicleId: string|number|null, clientId?: string|number|null }} params
 * @returns {TaxInvoiceRow}
 */
export function buildTaxInvoiceRow(item, { userId, vehicleId, clientId }) {
  return {
    user_id: userId,
    vehicle_id: vehicleId,
    client_id: clientId || null,
    flow: item?.flow || null,
    month_key: item?.monthKey || null,
    supply_amount: parseEntityNumber(item?.supplyAmount),
    tax_amount: parseEntityNumber(item?.taxAmount),
    total_amount: parseEntityNumber(item?.totalAmount),
    status: item?.status || 'draft',
    raw: item,
  }
}

/**
 * @param {Array<InvoiceLike>} localRecords
 * @param {Array<{ id: string|number, raw?: unknown }>} rows tax_invoices 서버 행
 * @returns {Array<InvoiceLike>}
 */
export function mergeTaxInvoiceRecords(localRecords, rows) {
  const merged = [...(localRecords || [])]
  ;(rows || []).forEach((row) => {
    const raw = row?.raw && typeof row.raw === 'object' ? /** @type {Record<string, unknown>} */ (row.raw) : {}
    if (!raw.id) return
    const record = /** @type {InvoiceLike} */ ({ ...raw, supabaseId: row.id })
    const index = merged.findIndex((item) => item.id === record.id)
    if (index >= 0) merged[index] = record
    else merged.push(record)
  })
  return merged
}

/**
 * @param {Array<InvoiceLike>} records
 * @param {string} localId
 * @param {string|number} supabaseId
 * @returns {Array<InvoiceLike>}
 */
export function applyInsertedTaxInvoiceId(records, localId, supabaseId) {
  return (records || []).map((item) => (item.id === localId ? { ...item, supabaseId } : item))
}
