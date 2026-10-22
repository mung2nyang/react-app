import type { ReceivableItemLike } from './financeReceivables.ts'

export type ReceivableGroup = {
  client: string
  monthKey: string
  total: number
  count: number
  items: Array<ReceivableItemLike>
}

export function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function groupByClientMonth(items?: Array<ReceivableItemLike>): Array<ReceivableGroup> {
  const grouped: Record<string, ReceivableGroup> = {}
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

export function groupItems(items: Array<ReceivableItemLike>, clientName: string, monthKey: string): Array<ReceivableItemLike> {
  return (items || [])
    .filter((item) => item.client === clientName && String(item.workDate || '').slice(0, 7) === monthKey)
    .sort((a, b) => String(a.workDate).localeCompare(String(b.workDate)))
}

function daysUntil(dueDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!dueDate) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

export function dueSoonItems(items?: Array<ReceivableItemLike>, now: Date = new Date()): Array<ReceivableItemLike> {
  return (items || [])
    .filter((item) => {
      const diff = daysUntil(item.paymentDueDate, now)
      return diff !== null && diff <= 3
    })
    .sort((a, b) => String(a.paymentDueDate).localeCompare(String(b.paymentDueDate)))
}

export function overdueItems(items?: Array<ReceivableItemLike>, now: Date = new Date()): Array<ReceivableItemLike> {
  return (items || [])
    .filter((item) => {
      const diff = daysUntil(item.paymentDueDate, now)
      return diff !== null && diff < 0
    })
    .sort((a, b) => String(a.paymentDueDate).localeCompare(String(b.paymentDueDate)))
}

export function getDdayLabel(dueDate: string | null | undefined, now: Date = new Date()): string {
  const diff = daysUntil(dueDate, now)
  if (diff === null) return ''
  if (diff === 0) return 'D-Day'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)} 연체`
}

export function formatWorkMonth(monthKey: string | null | undefined): string {
  const [year, month] = String(monthKey || '').split('-')
  if (!year || !month) return '운행월 미입력'
  return `${year}년 ${Number(month)}월 운행분`
}

export function receivableItemKey(item: Pick<ReceivableItemLike, 'logId' | 'dateKey' | 'detailId'>): string {
  return `${item.logId}|${item.dateKey}|${item.detailId}`
}
