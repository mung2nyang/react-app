import type { JsonRecord, JsonValue } from './jsonTypes.ts'
import type { ExpenseItem } from './expenseTypes.ts'

/** 주유 변환 중간형 — ExpenseItem에 type/liter 등 레거시 필드를 덧붙인 형태. */
export type FuelExpenseShape = ExpenseItem & { type?: string, liter?: number | string, fare?: number | string }
export type FuelRecordRow = {
  work_date?: string
  sequence?: number
  cost_amount?: JsonValue | undefined
  subsidy_amount?: JsonValue | undefined
  mileage_km?: JsonValue | undefined
  volume_liter?: JsonValue | undefined
  raw?: JsonValue | undefined
}
export type FuelRawBlob = {
  id?: string
  date?: string
  fuelType?: string
  type?: string
  name?: string
  category?: string
  payment?: string
  cost?: JsonValue | undefined
  subsidy?: JsonValue | undefined
  mileage?: JsonValue | undefined
  liters?: JsonValue | undefined
  liter?: JsonValue | undefined
  vehicleNumber?: string
}

export function parseEntityNumber(value: JsonValue | undefined): number {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function fuelItemFromExpense(expense: ExpenseItem | Record<string, JsonValue | undefined> | null | undefined): FuelExpenseShape {
  const src = expense as FuelExpenseShape | Record<string, JsonValue | undefined> | null | undefined
  return ({
    ...(expense && typeof expense === 'object' ? expense : {}),
    type: src?.fuelType || src?.type || src?.name || '주유',
    cost: src?.cost,
    subsidy: src?.subsidy || 0,
    liter: src?.liter ?? src?.liters ?? 0,
    mileage: src?.mileage || 0,
  }) as FuelExpenseShape
}

export function expenseFromFuelRecord(row: FuelRecordRow | null | undefined, index = 0): ExpenseItem {
  const raw = (row?.raw && typeof row.raw === 'object' ? row.raw : {}) as FuelRawBlob
  const date = row?.work_date || raw.date || ''
  const fuelType = raw.fuelType || raw.type || raw.name || '주유'
  return {
    id: raw.id || `fuel-${date}-${row?.sequence ?? index}`,
    kind: 'fuel',
    date,
    name: raw.name || fuelType,
    category: raw.category || fuelType,
    fuelType,
    payment: raw.payment || '카드',
    cost: raw.cost != null ? parseEntityNumber(raw.cost) : parseEntityNumber(row?.cost_amount),
    subsidy: raw.subsidy != null ? parseEntityNumber(raw.subsidy) : parseEntityNumber(row?.subsidy_amount),
    mileage: raw.mileage != null ? parseEntityNumber(raw.mileage) : parseEntityNumber(row?.mileage_km),
    liters: raw.liters != null ? parseEntityNumber(raw.liters) : parseEntityNumber(raw.liter ?? row?.volume_liter),
    vehicleNumber: typeof raw.vehicleNumber === 'string' && raw.vehicleNumber ? raw.vehicleNumber : undefined,
  }
}

export function replaceFuelExpenses(expenses: Array<ExpenseItem | JsonRecord>, fuelExpenses: Array<ExpenseItem | JsonRecord>): Array<ExpenseItem | JsonRecord> {
  return [...(expenses || []).filter((item) => item.kind !== 'fuel'), ...(fuelExpenses || [])]
}

export function buildFuelRecordRow(item: ExpenseItem | Record<string, JsonValue | undefined>, index: number, { dailyLogId, userId, vehicleId, workDate }: { dailyLogId: number | string, userId: string, vehicleId: number | string, workDate: string }): Record<string, JsonValue> & { raw: JsonRecord } {
  const src = item as FuelExpenseShape | Record<string, JsonValue | undefined>
  const fuelItem = (item?.kind === 'fuel' ? fuelItemFromExpense(item) : { ...item, liter: src?.liter ?? src?.liters }) as FuelExpenseShape
  return {
    daily_log_id: dailyLogId,
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    sequence: index,
    cost_amount: parseEntityNumber(fuelItem.cost),
    subsidy_amount: parseEntityNumber(fuelItem.subsidy),
    volume_liter: parseEntityNumber(fuelItem.liter),
    mileage_km: parseEntityNumber(fuelItem.mileage),
    raw: fuelItem,
  }
}
