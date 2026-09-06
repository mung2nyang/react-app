// @ts-check
/** @typedef {import('./financeReceivables.js').ReceivableItemLike} ReceivableItemLike */
/**
 * @typedef {Object} ReceivableGroup
 * @property {string} client
 * @property {string} monthKey
 * @property {number} total
 * @property {number} count
 * @property {Array<ReceivableItemLike>} items
 */

export function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * @param {Array<ReceivableItemLike>} [items]
 * @returns {Array<ReceivableGroup>}
 */
export function groupByClientMonth(items) {
  /** @type {Record<string, ReceivableGroup>} */
  const grouped = {}
  ;(items || []).forEach((item) => {
    const monthKey = String(item.workDate || '').slice(0, 7)
    const groupKey = `${item.client}|${monthKey}`
    if (!grouped[groupKey]) {
      grouped[groupKey] = { client: item.client, monthKey, total: 0, count: 0, items: [] }
    }
    grouped[groupKey].total += item.remainingAmount
    grouped[groupKey].count += 1
    grouped[groupKey].items.push(item)
  })
  return Object.values(grouped).sort((a, b) => a.monthKey.localeCompare(b.monthKey))
}

/**
 * @param {Array<ReceivableItemLike>} items
 * @param {string} clientName
 * @param {string} monthKey
 * @returns {Array<ReceivableItemLike>}
 */
export function groupItems(items, clientName, monthKey) {
  return (items || [])
    .filter((item) => item.client === clientName && String(item.workDate || '').slice(0, 7) === monthKey)
    .sort((a, b) => String(a.workDate).localeCompare(String(b.workDate)))
}

/**
 * @param {string|null|undefined} dueDate
 * @param {Date} [now]
 * @returns {number|null}
 */
function daysUntil(dueDate, now = new Date()) {
  if (!dueDate) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

/**
 * @param {Array<ReceivableItemLike>} [items]
 * @param {Date} [now]
 * @returns {Array<ReceivableItemLike>}
 */
export function dueSoonItems(items, now = new Date()) {
  return (items || [])
    .filter((item) => {
      const diff = daysUntil(item.paymentDueDate, now)
      return diff !== null && diff <= 3
    })
    .sort((a, b) => String(a.paymentDueDate).localeCompare(String(b.paymentDueDate)))
}

/**
 * @param {Array<ReceivableItemLike>} [items]
 * @param {Date} [now]
 * @returns {Array<ReceivableItemLike>}
 */
export function overdueItems(items, now = new Date()) {
  return (items || [])
    .filter((item) => {
      const diff = daysUntil(item.paymentDueDate, now)
      return diff !== null && diff < 0
    })
    .sort((a, b) => String(a.paymentDueDate).localeCompare(String(b.paymentDueDate)))
}

/**
 * @param {string|null|undefined} dueDate
 * @param {Date} [now]
 * @returns {string}
 */
export function getDdayLabel(dueDate, now = new Date()) {
  const diff = daysUntil(dueDate, now)
  if (diff === null) return ''
  if (diff === 0) return 'D-Day'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)} 연체`
}

/**
 * @param {string|null|undefined} monthKey
 * @returns {string}
 */
export function formatWorkMonth(monthKey) {
  const [year, month] = String(monthKey || '').split('-')
  if (!year || !month) return '운행월 미입력'
  return `${year}년 ${Number(month)}월 운행분`
}

/**
 * @param {Pick<ReceivableItemLike, 'logId'|'dateKey'|'detailId'>} item
 * @returns {string}
 */
export function receivableItemKey(item) {
  return `${item.logId}|${item.dateKey}|${item.detailId}`
}
