import type { JsonRecord, JsonValue } from './jsonTypes.ts'
import type { ExpenseItem } from './expenseTypes.ts'

/** 기타 비용 변환 중간형 — ExpenseItem에 fare 등 레거시 필드를 덧붙인 형태. */
export type MiscExpenseShape = ExpenseItem & { fare?: number | string, type?: string, liter?: number | string }
export type MiscRecordRow = {
  work_date?: string
  sequence?: number
  cost_amount?: JsonValue | undefined
  raw?: JsonValue | undefined
}
export type MiscRawBlob = {
  id?: string
  date?: string
  name?: string
  category?: string
  fuelType?: string
  payment?: string
  cost?: JsonValue | undefined
  fare?: JsonValue | undefined
  subsidy?: JsonValue | undefined
  mileage?: JsonValue | undefined
  liters?: JsonValue | undefined
  vehicleNumber?: string
}

export function parseEntityNumber(value: JsonValue | undefined): number {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function miscItemFromExpense(expense: ExpenseItem | Record<string, JsonValue | undefined> | null | undefined): MiscExpenseShape {
  const src = expense as MiscExpenseShape | Record<string, JsonValue | undefined> | null | undefined
  return ({
    ...(expense && typeof expense === 'object' ? expense : {}),
    name: src?.name || src?.category || '기타',
    fare: src?.fare ?? src?.cost,
    category: src?.category || '',
  }) as MiscExpenseShape
}

export function expenseFromMiscRecord(row: MiscRecordRow | null | undefined, index = 0): ExpenseItem {
  const raw = (row?.raw && typeof row.raw === 'object' ? row.raw : {}) as MiscRawBlob
  const date = row?.work_date || raw.date || ''
  const name = raw.name || raw.category || '기타'
  return {
    id: raw.id || `misc-${date}-${row?.sequence ?? index}`,
    kind: 'misc',
    date,
    name,
    category: raw.category || '',
    fuelType: raw.fuelType || '주유',
    payment: raw.payment || '카드',
    cost: raw.cost != null ? parseEntityNumber(raw.cost) : parseEntityNumber(raw.fare ?? row?.cost_amount),
    subsidy: raw.subsidy != null ? parseEntityNumber(raw.subsidy) : 0,
    mileage: raw.mileage != null ? parseEntityNumber(raw.mileage) : 0,
    liters: raw.liters != null ? parseEntityNumber(raw.liters) : 0,
    vehicleNumber: typeof raw.vehicleNumber === 'string' && raw.vehicleNumber ? raw.vehicleNumber : undefined,
  }
}

export function replaceMiscExpenses(expenses: Array<ExpenseItem | JsonRecord>, miscExpenses: Array<ExpenseItem | JsonRecord>): Array<ExpenseItem | JsonRecord> {
  return [...(expenses || []).filter((item) => item.kind !== 'misc'), ...(miscExpenses || [])]
}

export function buildMiscExpenseRecordRow(item: ExpenseItem | Record<string, JsonValue | undefined>, index: number, { dailyLogId, userId, vehicleId, workDate }: { dailyLogId: number | string, userId: string, vehicleId: number | string, workDate: string }): Record<string, JsonValue> & { raw: JsonRecord } {
  const src = item as MiscExpenseShape | Record<string, JsonValue | undefined>
  const miscItem = (item?.kind === 'misc' ? miscItemFromExpense(item) : { ...item, fare: src?.fare ?? src?.cost }) as MiscExpenseShape
  return {
    daily_log_id: dailyLogId,
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    sequence: index,
    cost_amount: parseEntityNumber(miscItem.fare),
    raw: miscItem,
  }
}
