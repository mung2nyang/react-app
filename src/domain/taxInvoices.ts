// 세금계산서(tax_invoices) 순수 계산 — 금액 파싱, 차량/거래처 id 해소, upsert 행 조립,
// 서버 행 병합. 실제 Supabase I/O는 data/sync/syncTaxInvoicesTable.ts가, 하이드레이트 병합
// 호출은 data/hydrate/hydrate.ts가 한다. 타입은 기존 InvoiceLike/CarLike 재사용.
import type { JsonValue } from './jsonTypes.ts'
import type { InvoiceLike } from './financeTaxInvoiceEntries.ts'
import type { CarLike } from './financeTypes.ts'

/** buildTaxInvoiceRow가 읽는 필드만 — 실제로는 InvoiceLike가 넘어온다 */
export type TaxInvoiceItemInput = {
  /** raw로 저장돼 mergeTaxInvoiceRecords가 병합 키로 다시 읽는다 */
  id?: string
  flow?: string
  monthKey?: string
  supplyAmount?: number | string
  taxAmount?: number | string
  totalAmount?: number | string
  status?: string
}

/** tax_invoices 테이블 insert/update 행 (원본 finance-sync 10컬럼) */
export type TaxInvoiceRow = {
  user_id: string
  vehicle_id: string | number | null
  client_id: string | number | null
  flow: string | null
  month_key: string | null
  supply_amount: number
  tax_amount: number
  total_amount: number
  status: string
  raw: TaxInvoiceItemInput
}

export function parseEntityNumber(value: JsonValue | undefined) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export const TAX_INVOICE_VEHICLE_RETRY_ERROR = '방금 등록한 차량이 아직 저장 중입니다. 잠시 후 다시 시도해 주세요.'

export function resolveTaxInvoiceVehicleId(item: { carNumber?: string | null, vehicleNumbers?: Array<string> | null }, settings: { cars?: Array<CarLike> } = {}): string | number | null {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const carNumber = item?.carNumber || (Array.isArray(item?.vehicleNumbers) ? item.vehicleNumbers[0] : null)
  if (carNumber) {
    const car = cars.find((entry) => entry.number === carNumber)
    return car?.supabaseId || null
  }
  const mainCar = cars.find((entry) => entry.type === 'main')
  return mainCar?.supabaseId || null
}

export function matchTaxInvoiceClientId(item: { clientName?: string }, clients: Array<{ companyName?: string, supabaseId?: string | number }> = []): string | number | null {
  const matched = (clients || []).find((client) => client.companyName === item?.clientName)
  return matched?.supabaseId || null
}

export function buildTaxInvoiceRow(item: TaxInvoiceItemInput, { userId, vehicleId, clientId }: { userId: string, vehicleId: string | number | null, clientId?: string | number | null }): TaxInvoiceRow {
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

/** @param rows tax_invoices 서버 행 */
export function mergeTaxInvoiceRecords(localRecords: Array<InvoiceLike>, rows: Array<{ id: string | number, raw?: JsonValue | Record<string, JsonValue | undefined> }>): Array<InvoiceLike> {
  const merged = [...(localRecords || [])]
  ;(rows || []).forEach((row) => {
    const raw = row?.raw && typeof row.raw === 'object' ? (row.raw as Record<string, JsonValue | undefined>) : {}
    if (!raw.id) return
    const record = ({ ...raw, supabaseId: row.id }) as InvoiceLike
    const index = merged.findIndex((item) => item.id === record.id)
    if (index >= 0) merged[index] = record
    else merged.push(record)
  })
  return merged
}

export function applyInsertedTaxInvoiceId(records: Array<InvoiceLike>, localId: string, supabaseId: string | number): Array<InvoiceLike> {
  return (records || []).map((item) => (item.id === localId ? { ...item, supabaseId } : item))
}

function replaceSuffix(value: string | undefined, suffix: string, next: string) {
  return value && value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) + next : undefined
}

/** 기사 차량 번호가 바뀌면 계산서 안의 옛 번호를 새 번호로(서버 rename_sub_vehicle과 같은 규칙). */
export function renameTaxInvoicePlate(item: InvoiceLike, oldNumber: string, newNumber: string): InvoiceLike {
  const changes: Partial<InvoiceLike> = {}
  const id = replaceSuffix(item.id, `__${oldNumber}`, `__${newNumber}`)
  if (id) changes.id = id
  const partyKey = replaceSuffix(item.partyKey, `__${oldNumber}`, `__${newNumber}`)
  if (partyKey) changes.partyKey = partyKey
  if (item.carNumber === oldNumber) changes.carNumber = newNumber
  if (item.logId === oldNumber) changes.logId = newNumber
  const vehicleLabel = item.vehicleLabel === oldNumber ? newNumber : replaceSuffix(item.vehicleLabel, `, ${oldNumber}`, `, ${newNumber}`)
  if (vehicleLabel) changes.vehicleLabel = vehicleLabel
  if (item.supplierKey?.startsWith(`car:${oldNumber}:`)) changes.supplierKey = `car:${newNumber}:${item.supplierKey.slice(`car:${oldNumber}:`.length)}`
  if (Array.isArray(item.vehicleNumbers) && item.vehicleNumbers.includes(oldNumber)) {
    changes.vehicleNumbers = item.vehicleNumbers.map((plate) => (plate === oldNumber ? newNumber : plate))
  }
  return Object.keys(changes).length ? { ...item, ...changes } : item
}
