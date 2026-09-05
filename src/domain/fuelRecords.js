// @ts-check
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonRecord} JsonRecord */
/**
 * 주유 변환 중간형 — ExpenseItem에 type/liter 등 레거시 필드를 덧붙인 형태.
 * @typedef {ExpenseItem & { type?: string, liter?: number|string, fare?: number|string }} FuelExpenseShape
 */
/**
 * @typedef {Object} FuelRecordRow
 * @property {string} [work_date]
 * @property {number} [sequence]
 * @property {unknown} [cost_amount]
 * @property {unknown} [subsidy_amount]
 * @property {unknown} [mileage_km]
 * @property {unknown} [volume_liter]
 * @property {unknown} [raw]
 */
/**
 * @typedef {Object} FuelRawBlob
 * @property {string} [id]
 * @property {string} [date]
 * @property {string} [fuelType]
 * @property {string} [type]
 * @property {string} [name]
 * @property {string} [category]
 * @property {string} [payment]
 * @property {unknown} [cost]
 * @property {unknown} [subsidy]
 * @property {unknown} [mileage]
 * @property {unknown} [liters]
 * @property {unknown} [liter]
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
 * @returns {FuelExpenseShape}
 */
export function fuelItemFromExpense(expense) {
  const src = /** @type {FuelExpenseShape|Record<string, unknown>|null|undefined} */ (expense)
  return /** @type {FuelExpenseShape} */ ({
    ...(expense && typeof expense === 'object' ? expense : {}),
    type: src?.fuelType || src?.type || src?.name || '주유',
    cost: src?.cost,
    subsidy: src?.subsidy || 0,
    liter: src?.liter ?? src?.liters ?? 0,
    mileage: src?.mileage || 0,
  })
}

/**
 * @param {FuelRecordRow|null|undefined} row
 * @param {number} [index]
 * @returns {ExpenseItem}
 */
export function expenseFromFuelRecord(row, index = 0) {
  const raw = /** @type {FuelRawBlob} */ (row?.raw && typeof row.raw === 'object' ? row.raw : {})
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
  }
}

/**
 * @param {Array<ExpenseItem|JsonRecord>} expenses
 * @returns {Record<string, Array<ExpenseItem|JsonRecord>>}
 */
export function groupFuelExpensesByDate(expenses) {
  /** @type {Record<string, Array<ExpenseItem|JsonRecord>>} */
  const grouped = {}
  ;(expenses || []).filter((item) => item?.kind === 'fuel' && item.date).forEach((item) => {
    const date = String(item.date)
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(item)
  })
  return grouped
}

/**
 * @param {Array<ExpenseItem|JsonRecord>} expenses
 * @param {Array<ExpenseItem|JsonRecord>} fuelExpenses
 * @returns {Array<ExpenseItem|JsonRecord>}
 */
export function replaceFuelExpenses(expenses, fuelExpenses) {
  return [...(expenses || []).filter((item) => item.kind !== 'fuel'), ...(fuelExpenses || [])]
}

/**
 * @param {ExpenseItem|Record<string, unknown>} item
 * @param {number} index
 * @param {{ dailyLogId: number|string, userId: string, vehicleId: number|string, workDate: string }} params
 * @returns {Record<string, unknown>}
 */
export function buildFuelRecordRow(item, index, { dailyLogId, userId, vehicleId, workDate }) {
  const src = /** @type {FuelExpenseShape|Record<string, unknown>} */ (item)
  const fuelItem = /** @type {FuelExpenseShape} */ (item?.kind === 'fuel' ? fuelItemFromExpense(item) : { ...item, liter: src?.liter ?? src?.liters })
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
