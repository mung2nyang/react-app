// @ts-check
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonRecord} JsonRecord */
/**
 * 정비 변환 중간형 — ExpenseItem에 fare 등 레거시 필드를 덧붙인 형태.
 * @typedef {ExpenseItem & { fare?: number|string, type?: string, liter?: number|string }} MaintExpenseShape
 */
/**
 * @typedef {Object} MaintenanceRecordRow
 * @property {string} [work_date]
 * @property {number} [sequence]
 * @property {unknown} [cost_amount]
 * @property {unknown} [mileage_km]
 * @property {unknown} [raw]
 */
/**
 * @typedef {Object} MaintRawBlob
 * @property {string} [id]
 * @property {string} [date]
 * @property {string} [name]
 * @property {string} [category]
 * @property {string} [fuelType]
 * @property {string} [payment]
 * @property {unknown} [cost]
 * @property {unknown} [fare]
 * @property {unknown} [subsidy]
 * @property {unknown} [mileage]
 * @property {unknown} [liters]
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
export function parseEntityNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * @param {ExpenseItem|Record<string, unknown>|null|undefined} expense
 * @returns {MaintExpenseShape}
 */
export function maintItemFromExpense(expense) {
  const src = /** @type {MaintExpenseShape|Record<string, unknown>|null|undefined} */ (expense)
  return /** @type {MaintExpenseShape} */ ({
    ...(expense && typeof expense === 'object' ? expense : {}),
    name: src?.name || src?.category || '정비',
    fare: src?.fare ?? src?.cost,
    mileage: src?.mileage || 0,
    category: src?.category || '',
  })
}

/**
 * @param {MaintenanceRecordRow|null|undefined} row
 * @param {number} [index]
 * @returns {ExpenseItem}
 */
export function expenseFromMaintenanceRecord(row, index = 0) {
  const raw = /** @type {MaintRawBlob} */ (row?.raw && typeof row.raw === 'object' ? row.raw : {})
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
  }
}

/**
 * @param {Array<ExpenseItem|JsonRecord>} expenses
 * @returns {Record<string, Array<ExpenseItem|JsonRecord>>}
 */
export function groupMaintExpensesByDate(expenses) {
  /** @type {Record<string, Array<ExpenseItem|JsonRecord>>} */
  const grouped = {}
  ;(expenses || []).filter((item) => item?.kind === 'maint' && item.date).forEach((item) => {
    const date = String(item.date)
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(item)
  })
  return grouped
}

/**
 * @param {Array<ExpenseItem|JsonRecord>} expenses
 * @param {Array<ExpenseItem|JsonRecord>} maintExpenses
 * @returns {Array<ExpenseItem|JsonRecord>}
 */
export function replaceMaintExpenses(expenses, maintExpenses) {
  return [...(expenses || []).filter((item) => item.kind !== 'maint'), ...(maintExpenses || [])]
}

/**
 * @param {ExpenseItem|Record<string, unknown>} item
 * @param {number} index
 * @param {{ dailyLogId: number|string, userId: string, vehicleId: number|string, workDate: string }} params
 * @returns {Record<string, unknown>}
 */
export function buildMaintenanceRecordRow(item, index, { dailyLogId, userId, vehicleId, workDate }) {
  const src = /** @type {MaintExpenseShape|Record<string, unknown>} */ (item)
  const maintItem = /** @type {MaintExpenseShape} */ (item?.kind === 'maint' ? maintItemFromExpense(item) : { ...item, fare: src?.fare ?? src?.cost })
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
