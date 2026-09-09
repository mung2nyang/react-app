// @ts-check
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */

/**
 * 일지(logId) 스코프에 맞는 정비/주유/기타만 반환.
 * logId가 없거나 `'main'`이면 메인(미태그) 항목만, 아니면 해당 차량 태그만.
 * @param {Array<ExpenseItem>|null|undefined} items
 * @param {string} [logId]
 * @returns {Array<ExpenseItem>}
 */
export function getExpensesForLog(items, logId) {
  const list = items || []
  const key = String(logId || '').trim()
  if (!key || key === 'main') {
    return list.filter((item) => !item.vehicleNumber)
  }
  return list.filter((item) => item.vehicleNumber === key)
}
