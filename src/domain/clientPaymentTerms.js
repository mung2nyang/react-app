// @ts-check
// 결제 주기·입금 예정일 계산(거래처 CRUD와 독립). clients.js가 재수출한다.
/** @typedef {import('./clientTypes.js').ClientLike} ClientLike */

export const PAYMENT_TERMS = [
  { value: 'same_day', label: '당일·수시 정산' },
  { value: 'after_days', label: '운행 건별 정산 (N일 후)' },
  { value: 'next_month_day', label: '익월 지정일 정산' },
  { value: 'next_month_end', label: '익월 말일 정산' },
  { value: 'second_month_day', label: '익익월 지정일 정산' },
  { value: 'second_month_end', label: '익익월 말일 정산' },
]

/** @param {string} [term] */
export function needsPaymentTermValue(term) {
  return term === 'after_days' || term === 'next_month_day' || term === 'second_month_day'
}

/**
 * @param {string} [term]
 * @param {string|number} [value]
 */
export function getPaymentTermLabel(term, value) {
  if (term === 'next_month_end') return '익월 말일 정산'
  if (term === 'second_month_end') return '익익월 말일 정산'
  if (term === 'next_month_day') return `익월 ${value || ''}일 정산`
  if (term === 'second_month_day') return `익익월 ${value || ''}일 정산`
  if (term === 'after_days') return `운행 건별 ${value || ''}일 후 정산`
  return '당일·수시 정산'
}

/** @param {Date} date */
export function formatDateToYmd(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * @param {string} workDate
 * @param {string} [paymentTerm]
 * @param {string|number} [paymentTermValue]
 */
export function calculatePaymentDueDate(workDate, paymentTerm, paymentTermValue) {
  const date = new Date(`${workDate}T00:00:00`)

  if (paymentTerm === 'next_month_end') {
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 2, 0))
  }

  if (paymentTerm === 'second_month_end') {
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 3, 0))
  }

  if (paymentTerm === 'second_month_day') {
    const selectedDay = Math.max(1, Math.min(31, parseInt(String(paymentTermValue), 10) || 1))
    const secondMonthLastDay = new Date(date.getFullYear(), date.getMonth() + 3, 0).getDate()
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 2, Math.min(selectedDay, secondMonthLastDay)))
  }

  if (paymentTerm === 'next_month_day') {
    const selectedDay = Math.max(1, Math.min(31, parseInt(String(paymentTermValue), 10) || 1))
    const nextMonthLastDay = new Date(date.getFullYear(), date.getMonth() + 2, 0).getDate()
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 1, Math.min(selectedDay, nextMonthLastDay)))
  }

  if (paymentTerm === 'after_days') {
    const days = Math.max(0, parseInt(String(paymentTermValue), 10) || 0)
    date.setDate(date.getDate() + days)
    return formatDateToYmd(date)
  }

  return formatDateToYmd(date)
}

/**
 * @param {string} workDate
 * @param {ClientLike|null} [client]
 */
export function dueDateForClient(workDate, client) {
  if (!workDate) return ''
  return calculatePaymentDueDate(workDate, client?.paymentTerm || 'next_month_end', client?.paymentTermValue)
}
