// 지출 칸 저장 — 항목 id 기준으로 넣기·고치기·(내가 알던 것만) 지우기. 연동 차량 칸은 차주·기사 공용 장부.
import type { JsonValue } from '../../domain/jsonTypes.ts'
import { supabase } from '../cloud/supabaseClient.ts'
import { fetchAllRows } from '../cloud/fetchAllRows.ts'
import { buildFuelRecordRow, expenseFromFuelRecord } from '../../domain/fuelRecords.ts'
import { buildMaintenanceRecordRow, expenseFromMaintenanceRecord, parseEntityNumber } from '../../domain/maintenanceRecords.ts'
import { buildMiscExpenseRecordRow, expenseFromMiscRecord } from '../../domain/miscExpenseRecords.ts'
import type { ExpenseItem } from '../../domain/expenseTypes.ts'

export type RowContext = { dailyLogId: string, userId: string, vehicleId: string | number, workDate: string }
export type ServerRow = { id: string, raw?: JsonValue, work_date?: string, sequence?: number }
export type KindSpec = {
  kind: 'fuel' | 'maint' | 'misc'
  table: string
  buildRow: (item: ExpenseItem, index: number, ctx: RowContext) => Record<string, JsonValue>
  mapRow: (row: ServerRow, index: number) => ExpenseItem
}
export type SyncContext = {
  userId: string
  vehicleId: string | number
  previous: Array<ExpenseItem>
  next: Array<ExpenseItem>
  workData: Record<string, JsonValue | undefined>
  idByDate: Map<string, string>
  legacyVehicleId: string | number | null // 옛 항목이 잘못 쌓여 있을 수 있는 칸(차주 메인 차량, 5-B-2)
  restoreMissing: boolean // 차주만 쓰는 칸(메인·미연동)이면 true
}

const KIND_SPECS: Array<KindSpec> = [
  { kind: 'fuel', table: 'fuel_records', buildRow: buildFuelRecordRow, mapRow: expenseFromFuelRecord },
  { kind: 'maint', table: 'maintenance_records', buildRow: buildMaintenanceRecordRow, mapRow: expenseFromMaintenanceRecord },
  { kind: 'misc', table: 'misc_expense_records', buildRow: buildMiscExpenseRecordRow, mapRow: expenseFromMiscRecord },
]

async function dailyLogIdsByDate(vehicleId: string | number): Promise<Map<string, string>> {
  const { data, error } = await fetchAllRows(() => supabase.from('daily_logs').select('id, work_date').eq('vehicle_id', vehicleId).order('id'))
  if (error) throw error
  return new Map((data || []).map((row) => [row.work_date, row.id]))
}

/** 그날 하루 기록 줄이 없을 때만 만든다 — 이미 있으면(상대가 방금 만든 것 포함) 덮어쓰지 않는다. */
async function ensureDailyLog(ctx: SyncContext, workDate: string): Promise<string> {
  const known = ctx.idByDate.get(workDate)
  if (known) return known
  const record = ctx.workData[workDate]
  const safeRecord = (record && typeof record === 'object' ? record : { isOff: false, fixedCount: 0 }) as Record<string, JsonValue | undefined>
  const { callDetails: _callDetails, fuelItems: _fuelItems, maintItems: _maintItems, miscItems: _miscItems, ...dailyFields } = safeRecord
  const { error } = await supabase.from('daily_logs').upsert({
    user_id: ctx.userId,
    vehicle_id: ctx.vehicleId,
    work_date: workDate,
    is_off: !!safeRecord.isOff,
    fixed_count: parseEntityNumber(safeRecord.fixedCount),
    pallet_count: parseEntityNumber(safeRecord.palletCount),
    raw: dailyFields,
  }, { onConflict: 'vehicle_id,work_date', ignoreDuplicates: true })
  if (error) throw error
  const { data, error: readError } = await supabase
    .from('daily_logs').select('id').eq('vehicle_id', ctx.vehicleId).eq('work_date', workDate).single()
  if (readError) throw readError
  const id = (data?.id) as string
  ctx.idByDate.set(workDate, id)
  return id
}

async function fetchRows(spec: KindSpec, vehicleId: string | number): Promise<Array<ServerRow>> {
  const { data, error } = await fetchAllRows(() => supabase
    .from(spec.table).select('id, raw, work_date, sequence').eq('vehicle_id', vehicleId).order('sequence', { ascending: true }).order('id'))
  if (error) throw error
  return (data || []) as Array<ServerRow>
}

async function syncKind(spec: KindSpec, ctx: SyncContext) {
  const rows = await fetchRows(spec, ctx.vehicleId)
  const legacyIds = ctx.legacyVehicleId != null
    ? new Set((await fetchRows(spec, ctx.legacyVehicleId)).map((row, index) => spec.mapRow(row, index).id))
    : new Set<string>()
  const serverByItemId: Map<string, ServerRow> = new Map()
  const lastSequenceByDate: Map<string, number> = new Map()
  rows.forEach((row, index) => {
    serverByItemId.set(spec.mapRow(row, index).id, row)
    const date = String(row.work_date || '')
    lastSequenceByDate.set(date, Math.max(lastSequenceByDate.get(date) ?? -1, Number(row.sequence) || 0))
  })
  const previousById = new Map(ctx.previous.filter((item) => item.kind === spec.kind).map((item) => [item.id, item]))
  const nextItems = ctx.next.filter((item) => item.kind === spec.kind && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')))
  const nextIds = new Set(nextItems.map((item) => item.id))

  for (const item of nextItems) {
    const row = serverByItemId.get(item.id)
    const previous = previousById.get(item.id)
    const unchanged = !!previous && JSON.stringify(previous) === JSON.stringify(item)
    // 안 바뀐 항목: 서버에 있으면 그대로, 없으면 상대가 지운 것이므로 되살리지 않는다(단 메인 칸 옛 항목은 옮겨 넣는다).
    // 차주만 쓰는 칸은 서버에서 빠진 항목을 다시 넣는다(앞선 저장이 끊긴 경우).
    if (unchanged && (row || (!legacyIds.has(item.id) && !ctx.restoreMissing))) continue
    const dailyLogId = await ensureDailyLog(ctx, item.date)
    const rowContext = { dailyLogId, userId: ctx.userId, vehicleId: ctx.vehicleId, workDate: item.date }
    if (!row) {
      const sequence = (lastSequenceByDate.get(item.date) ?? -1) + 1
      lastSequenceByDate.set(item.date, sequence)
      const { error: insertError } = await supabase.from(spec.table).insert(spec.buildRow(item, sequence, rowContext))
      if (insertError) throw insertError
      continue
    }
    // 고치기는 원래 쓴 사람(user_id)을 유지한다.
    const { user_id: _userId, ...changes } = spec.buildRow(item, Number(row.sequence) || 0, rowContext)
    const { error: updateError } = await supabase.from(spec.table).update(changes).eq('id', row.id)
    if (updateError) throw updateError
  }

  for (const id of previousById.keys()) {
    if (nextIds.has(id)) continue
    const row = serverByItemId.get(id)
    if (!row) continue
    const { error: deleteError } = await supabase.from(spec.table).delete().eq('id', row.id)
    if (deleteError) throw deleteError
  }
}

/**
 * 한 차량 칸의 정비/주유/기타를 항목 단위로 맞춘다. previous = 저장 전 화면 목록(내가 알던 항목).
 * @param legacyVehicleId 옛 항목을 찾을 칸(차주 메인 차량). 기사 쪽은 없음
 * @param restoreMissing 차주만 쓰는 칸이면 true
 */
export async function syncExpenseItemsForVehicle(userId: string, vehicleId: string | number, previous: Array<ExpenseItem>, next: Array<ExpenseItem>, workData: Record<string, JsonValue | undefined>, legacyVehicleId: string | number | null = null, restoreMissing = false) {
  const ctx = { userId, vehicleId, previous, next, workData, legacyVehicleId, restoreMissing, idByDate: await dailyLogIdsByDate(vehicleId) }
  for (const spec of KIND_SPECS) {
    await syncKind(spec, ctx)
  }
}
