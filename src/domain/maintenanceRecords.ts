import type { JsonRecord, JsonValue } from './jsonTypes.ts'
import type { ExpenseItem } from './expenseTypes.ts'

/** 정비 변환 중간형 — ExpenseItem에 fare 등 레거시 필드를 덧붙인 형태. */
export type MaintExpenseShape = ExpenseItem & { fare?: number | string, type?: string, liter?: number | string }
export type MaintenanceRecordRow = {
  work_date?: string
  sequence?: number
  cost_amount?: JsonValue | undefined
  mileage_km?: JsonValue | undefined
  raw?: JsonValue | undefined
}
export type MaintRawBlob = {
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

export function maintItemFromExpense(expense: ExpenseItem | Record<string, JsonValue | undefined> | null | undefined): MaintExpenseShape {
  const src = expense as MaintExpenseShape | Record<string, JsonValue | undefined> | null | undefined
  return ({
    ...(expense && typeof expense === 'object' ? expense : {}),
    name: src?.name || src?.category || '정비',
    fare: src?.fare ?? src?.cost,
    mileage: src?.mileage || 0,
    category: src?.category || '',
  }) as MaintExpenseShape
}

export function expenseFromMaintenanceRecord(row: MaintenanceRecordRow | null | undefined, index = 0): ExpenseItem {
  const raw = (row?.raw && typeof row.raw === 'object' ? row.raw : {}) as MaintRawBlob
  const date = row?.work_date || raw.date || ''
  const name = raw.name || raw.category || '정비'
  return {
    id: raw.id || `maint-${date}-${row?.sequence ?? index}`,
    kind: 'maint',
    date,
    name,
    category: raw.category || '',
    fuelType: raw.fuelType || '주유',
    payment: raw.payment || '카드',
    cost: raw.cost != null ? parseEntityNumber(raw.cost) : parseEntityNumber(raw.fare ?? row?.cost_amount),
    subsidy: raw.subsidy != null ? parseEntityNumber(raw.subsidy) : 0,
    mileage: raw.mileage != null ? parseEntityNumber(raw.mileage) : parseEntityNumber(row?.mileage_km),
    liters: raw.liters != null ? parseEntityNumber(raw.liters) : 0,
    vehicleNumber: typeof raw.vehicleNumber === 'string' && raw.vehicleNumber ? raw.vehicleNumber : undefined,
  }
}

export function replaceMaintExpenses(expenses: Array<ExpenseItem | JsonRecord>, maintExpenses: Array<ExpenseItem | JsonRecord>): Array<ExpenseItem | JsonRecord> {
  return [...(expenses || []).filter((item) => item.kind !== 'maint'), ...(maintExpenses || [])]
}

export function buildMaintenanceRecordRow(item: ExpenseItem | Record<string, JsonValue | undefined>, index: number, { dailyLogId, userId, vehicleId, workDate }: { dailyLogId: number | string, userId: string, vehicleId: number | string, workDate: string }): Record<string, JsonValue> & { raw: JsonRecord } {
  const src = item as MaintExpenseShape | Record<string, JsonValue | undefined>
  const maintItem = (item?.kind === 'maint' ? maintItemFromExpense(item) : { ...item, fare: src?.fare ?? src?.cost }) as MaintExpenseShape
  return {
    daily_log_id: dailyLogId,
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    sequence: index,
    cost_amount: parseEntityNumber(maintItem.fare),
    mileage_km: parseEntityNumber(maintItem.mileage),
    raw: maintItem,
  }
}
