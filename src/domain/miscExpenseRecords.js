// @ts-check
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonRecord} JsonRecord */
/**
 * 기타 비용 변환 중간형 — ExpenseItem에 fare 등 레거시 필드를 덧붙인 형태.
 * @typedef {ExpenseItem & { fare?: number|string, type?: string, liter?: number|string }} MiscExpenseShape
 */
/**
 * @typedef {Object} MiscRecordRow
 * @property {string} [work_date]
 * @property {number} [sequence]
 * @property {unknown} [cost_amount]
 * @property {unknown} [raw]
 */
/**
 * @typedef {Object} MiscRawBlob
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
 * @property {string} [vehicleNumber]
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
 * @returns {MiscExpenseShape}
 */
export function miscItemFromExpense(expense) {
  const src = /** @type {MiscExpenseShape|Record<string, unknown>|null|undefined} */ (expense)
  return /** @type {MiscExpenseShape} */ ({
    ...(expense && typeof expense === 'object' ? expense : {}),
    name: src?.name || src?.category || '기타',
    fare: src?.fare ?? src?.cost,
    category: src?.category || '',
  })
}

/**
 * @param {MiscRecordRow|null|undefined} row
 * @param {number} [index]
 * @returns {ExpenseItem}
 */
export function expenseFromMiscRecord(row, index = 0) {
  const raw = /** @type {MiscRawBlob} */ (row?.raw && typeof row.raw === 'object' ? row.raw : {})
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

/**
 * @param {Array<ExpenseItem|JsonRecord>} expenses
 * @returns {Record<string, Array<ExpenseItem|JsonRecord>>}
 */
export function groupMiscExpensesByDate(expenses) {
  /** @type {Record<string, Array<ExpenseItem|JsonRecord>>} */
  const grouped = {}
  ;(expenses || []).filter((item) => item?.kind === 'misc' && item.date).forEach((item) => {
    const date = String(item.date)
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(item)
  })
  return grouped
}

/**
 * @param {Array<ExpenseItem|JsonRecord>} expenses
 * @param {Array<ExpenseItem|JsonRecord>} miscExpenses
 * @returns {Array<ExpenseItem|JsonRecord>}
 */
export function replaceMiscExpenses(expenses, miscExpenses) {
  return [...(expenses || []).filter((item) => item.kind !== 'misc'), ...(miscExpenses || [])]
}

/**
 * @param {ExpenseItem|Record<string, unknown>} item
 * @param {number} index
 * @param {{ dailyLogId: number|string, userId: string, vehicleId: number|string, workDate: string }} params
 * @returns {Record<string, unknown>}
 */
export function buildMiscExpenseRecordRow(item, index, { dailyLogId, userId, vehicleId, workDate }) {
  const src = /** @type {MiscExpenseShape|Record<string, unknown>} */ (item)
  const miscItem = /** @type {MiscExpenseShape} */ (item?.kind === 'misc' ? miscItemFromExpense(item) : { ...item, fare: src?.fare ?? src?.cost })
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
