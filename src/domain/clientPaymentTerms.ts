// 결제 주기·입금 예정일 계산(거래처 CRUD와 독립). clients.ts가 재수출한다.
import type { ClientLike } from './clientTypes.ts'

export const PAYMENT_TERMS = [
  { value: 'same_day', label: '당일/수시 정산' },
  { value: 'after_days', label: '운행 건별 정산 (N일 후)' },
  { value: 'next_month_day', label: '익월 지정일 정산' },
  { value: 'next_month_end', label: '익월 말일 정산' },
  { value: 'second_month_day', label: '익익월 지정일 정산' },
  { value: 'second_month_end', label: '익익월 말일 정산' },
]

export function needsPaymentTermValue(term?: string) {
  return term === 'after_days' || term === 'next_month_day' || term === 'second_month_day'
}

export function getPaymentTermLabel(term?: string, value?: string | number) {
  if (term === 'next_month_end') return '익월 말일 정산'
  if (term === 'second_month_end') return '익익월 말일 정산'
  if (term === 'next_month_day') return `익월 ${value || ''}일 정산`
  if (term === 'second_month_day') return `익익월 ${value || ''}일 정산`
  if (term === 'after_days') return `운행 건별 ${value || ''}일 후 정산`
  return '당일/수시 정산'
}

export function formatDateToYmd(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calculatePaymentDueDate(workDate: string, paymentTerm?: string, paymentTermValue?: string | number) {
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

export function dueDateForClient(workDate: string, client?: ClientLike | null) {
  if (!workDate) return ''
  return calculatePaymentDueDate(workDate, client?.paymentTerm || 'next_month_end', client?.paymentTermValue)
}
