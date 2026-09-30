// @ts-check
// 로드맵 5-B: 연동 차량 칸은 차주·기사 공용 장부 — 항목 id 기준으로 넣기·고치기·(내가 알던 것만) 지우기.
import { supabase } from '../supabaseClient.js'
import { buildFuelRecordRow, expenseFromFuelRecord } from '../domain/fuelRecords.js'
import { buildMaintenanceRecordRow, expenseFromMaintenanceRecord, parseEntityNumber } from '../domain/maintenanceRecords.js'
import { buildMiscExpenseRecordRow, expenseFromMiscRecord } from '../domain/miscExpenseRecords.js'

/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {{ dailyLogId: string, userId: string, vehicleId: string|number, workDate: string }} RowContext */
/** @typedef {{ id: string, raw?: Record<string, unknown>, work_date?: string, sequence?: number }} ServerRow */
/**
 * @typedef {Object} KindSpec
 * @property {'fuel'|'maint'|'misc'} kind
 * @property {string} table
 * @property {(item: ExpenseItem, index: number, ctx: RowContext) => Record<string, unknown>} buildRow
 * @property {(row: ServerRow, index: number) => ExpenseItem} mapRow
 */
/**
 * @typedef {Object} SyncContext
 * @property {string} userId
 * @property {string|number} vehicleId
 * @property {Array<ExpenseItem>} previous
 * @property {Array<ExpenseItem>} next
 * @property {Record<string, unknown>} workData
 * @property {Map<string, string>} idByDate
 */

/** @type {Array<KindSpec>} */
const KIND_SPECS = [
  { kind: 'fuel', table: 'fuel_records', buildRow: buildFuelRecordRow, mapRow: expenseFromFuelRecord },
  { kind: 'maint', table: 'maintenance_records', buildRow: buildMaintenanceRecordRow, mapRow: expenseFromMaintenanceRecord },
  { kind: 'misc', table: 'misc_expense_records', buildRow: buildMiscExpenseRecordRow, mapRow: expenseFromMiscRecord },
]

/**
 * @param {string|number} vehicleId
 * @returns {Promise<Map<string, string>>}
 */
async function dailyLogIdsByDate(vehicleId) {
  const { data, error } = await supabase.from('daily_logs').select('id, work_date').eq('vehicle_id', vehicleId)
  if (error) throw error
  return new Map((data || []).map((row) => [row.work_date, row.id]))
}

/**
 * 그날 하루 기록 줄이 없을 때만 만든다 — 이미 있으면(상대가 방금 만든 것 포함) 덮어쓰지 않는다.
 * @param {SyncContext} ctx
 * @param {string} workDate
 * @returns {Promise<string>}
 */
async function ensureDailyLog(ctx, workDate) {
  const known = ctx.idByDate.get(workDate)
  if (known) return known
  const record = ctx.workData[workDate]
  const safeRecord = /** @type {Record<string, unknown>} */ (record && typeof record === 'object' ? record : { isOff: false, fixedCount: 0 })
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
  const id = /** @type {string} */ (data?.id)
  ctx.idByDate.set(workDate, id)
  return id
}

/**
 * @param {KindSpec} spec
 * @param {SyncContext} ctx
 */
async function syncKind(spec, ctx) {
  const { data, error } = await supabase
    .from(spec.table).select('id, raw, work_date, sequence').eq('vehicle_id', ctx.vehicleId).order('sequence', { ascending: true })
  if (error) throw error
  const rows = /** @type {Array<ServerRow>} */ (data || [])
  /** @type {Map<string, ServerRow>} */
  const serverByItemId = new Map()
  /** @type {Map<string, number>} */
  const lastSequenceByDate = new Map()
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
    // 안 바뀐 항목: 서버에 있으면 그대로, 없으면 상대가 지운 것이므로 되살리지 않는다.
    if (unchanged) continue
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
 * @param {string} userId
 * @param {string|number} vehicleId
 * @param {Array<ExpenseItem>} previous
 * @param {Array<ExpenseItem>} next
 * @param {Record<string, unknown>} workData
 */
export async function syncExpenseItemsForVehicle(userId, vehicleId, previous, next, workData) {
  const ctx = { userId, vehicleId, previous, next, workData, idByDate: await dailyLogIdsByDate(vehicleId) }
  for (const spec of KIND_SPECS) {
    await syncKind(spec, ctx)
  }
}
