// 지출 순수 계산부(상수·달 계산·화면 표시). 입력값·검사·목록 고치기는 expenseDraft.ts, 저장은 data/sync/expensesSave.js, 타입 정본은 expenseTypes.ts.
import type { ExpenseItem } from './expenseTypes.ts'

export const KINDS = [
  { value: 'maint', label: '정비' },
  { value: 'fuel', label: '주유' },
  { value: 'misc', label: '기타' },
]

export const MAINT_CATEGORIES = ['엔진/미션', '판금/도장', '소모품', '기타']
export const MISC_CATEGORIES = ['통행료', '주차비', '과태료', '기타']
export const FUEL_TYPES = ['주유', '요소수', '기타']

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthPrefix(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function filterMonth(items: Array<ExpenseItem>, kind: string, year: number, monthIndex: number) {
  const prefix = monthPrefix(year, monthIndex)
  return (items || [])
    .filter((item) => item.kind === kind && String(item.date || '').startsWith(prefix))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

export function monthTotal(items: Array<ExpenseItem>, kind: string, year: number, monthIndex: number) {
  return filterMonth(items, kind, year, monthIndex).reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
}

export function groupExpensesByDate(items: Array<ExpenseItem>) {
  const groups = new Map<string, Array<ExpenseItem>>()
  const sorted = [...(items || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  sorted.forEach((item) => {
    const date = item.date || ''
    if (!groups.has(date)) groups.set(date, [])
    // groups.has(date)를 바로 위에서 확인했으니 get은 항상 값을 돌려준다.
    ;(groups.get(date) as Array<ExpenseItem>).push(item)
  })
  return [...groups.entries()].map(([date, dayItems]) => ({
    date,
    items: dayItems,
    dailyTotal: dayItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0),
  }))
}

export function expenseTitle(item: ExpenseItem | null | undefined, kindLabel = '') {
  if (!item) return kindLabel || '내역'
  if (item.kind === 'fuel') {
    const liters = Number(item.liters) || 0
    const label = item.fuelType || item.name || '주유'
    return liters ? `${label} (${liters}L)` : label
  }
  return item.name || item.category || kindLabel || (item.kind === 'misc' ? '기타' : '정비')
}

export function filterByDate(items: Array<ExpenseItem>, dateKey: string) {
  return (items || []).filter((item) => item.date === dateKey)
}

/** 같은 id는 한 번만 남긴다(먼저 나온 항목). 조회/hydrate가 비용을 복제해도 배열이 안 늘어나게. */
export function dedupeExpensesById<T extends { id?: string }>(items?: Array<T>): Array<T> {
  const seen = new Set<string>()
  const next: Array<T> = []
  ;(items || []).forEach((item) => {
    const id = item && typeof item.id === 'string' ? item.id : ''
    if (!id || seen.has(id)) return
    seen.add(id)
    next.push(item)
  })
  return next
}
