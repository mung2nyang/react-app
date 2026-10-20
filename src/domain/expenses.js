// @ts-check
// 지출 순수 계산부. 저장은 data/sync/expensesSave.js, 타입 정본은 expenseTypes.js.
import { generateLocalId } from './localId.js'
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('./expenseTypes.js').ExpenseDraft} ExpenseDraft */

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

/**
 * @param {number} year
 * @param {number} monthIndex
 */
export function monthPrefix(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/**
 * @param {Array<ExpenseItem>} items
 * @param {string} kind
 * @param {number} year
 * @param {number} monthIndex
 */
export function filterMonth(items, kind, year, monthIndex) {
  const prefix = monthPrefix(year, monthIndex)
  return (items || [])
    .filter((item) => item.kind === kind && String(item.date || '').startsWith(prefix))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

/**
 * @param {Array<ExpenseItem>} items
 * @param {string} kind
 * @param {number} year
 * @param {number} monthIndex
 */
export function monthTotal(items, kind, year, monthIndex) {
  return filterMonth(items, kind, year, monthIndex).reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
}

/**
 * @param {string} kind
 * @param {string} [date]
 * @param {string} [vehicleNumber] 서브 로그면 차량번호, 메인이면 생략
 */
export function emptyExpenseDraft(kind, date = todayKey(), vehicleNumber) {
  /** @type {ExpenseDraft} */
  const draft = {
    kind,
    date,
    name: '',
    category: kind === 'misc' ? MISC_CATEGORIES[0] : MAINT_CATEGORIES[0],
    fuelType: '주유',
    payment: '카드',
    cost: 0,
    subsidy: 0,
    mileage: 0,
    liters: '',
  }
  const vn = String(vehicleNumber || '').trim()
  if (vn) draft.vehicleNumber = vn
  return draft
}

// editingId 타입 설명 필수 — 없으면 기본값 null 때문에 TS가 null만 되는 타입으로 좁힌다.
// 저장 전 검사와 저장이 같은 문구를 쓰려고 한 파일에 둔다.
/**
 * 저장 전 입력 검사 — 맨 처음 문제 칸과 문구, 문제 없으면 null(지출 창 칸 표시와 upsertExpense가 같이 씀).
 * @param {ExpenseDraft} draft
 * @returns {{ field: 'date'|'name'|'cost', message: string }|null}
 */
export function checkExpenseDraft(draft) {
  const cost = Math.max(0, parseInt(String(draft.cost), 10) || 0)
  if (!String(draft.date || '').trim()) return { field: 'date', message: '날짜를 선택해 주세요.' }
  if (draft.kind === 'fuel') return cost ? null : { field: 'cost', message: '비용을 입력해 주세요.' }
  return String(draft.name || '').trim() || cost ? null : { field: 'name', message: '항목명 또는 비용을 입력해 주세요.' }
}

/**
 * @param {Array<ExpenseItem>} items
 * @param {ExpenseDraft} draft
 * @param {string|null} [editingId]
 */
export function upsertExpense(items, draft, editingId = null) {
  const kind = ['maint', 'fuel', 'misc'].includes(String(draft.kind)) ? draft.kind : 'maint'
  const date = String(draft.date || '').trim()
  const name = String(draft.name || '').trim()
  const category = String(draft.category || '').trim()
  const fuelType = FUEL_TYPES.includes(String(draft.fuelType)) ? draft.fuelType : '주유'
  const payment = draft.payment === '현금' ? '현금' : '카드'
  const cost = Math.max(0, parseInt(String(draft.cost), 10) || 0)
  const subsidy = Math.max(0, parseInt(String(draft.subsidy), 10) || 0)
  const mileage = Math.max(0, parseInt(String(draft.mileage), 10) || 0)
  const liters = Math.max(0, Number.parseFloat(String(draft.liters)) || 0)
  const vehicleNumber = String(draft.vehicleNumber || '').trim() || undefined

  const problem = checkExpenseDraft(draft)
  if (problem) return { error: problem.message, items }

  const next = {
    kind: /** @type {ExpenseItem['kind']} */ (kind),
    date,
    name: kind === 'fuel' ? fuelType : name,
    category: kind === 'fuel' ? fuelType : category,
    fuelType,
    payment,
    cost,
    subsidy: kind === 'fuel' ? subsidy : 0,
    mileage,
    liters: kind === 'fuel' ? liters : 0,
    vehicleNumber,
  }
  const list = [...(items || [])]

  if (editingId) {
    const idx = list.findIndex((item) => item.id === editingId)
    if (idx < 0) return { error: '내역을 찾지 못했습니다.', items }
    list[idx] = { ...list[idx], ...next }
    return { items: list }
  }

  list.push({ id: generateLocalId('exp'), ...next })
  return { items: list }
}

/**
 * @param {Array<ExpenseItem>} items
 * @param {string} id
 */
export function removeExpense(items, id) {
  return (items || []).filter((item) => item.id !== id)
}

/** @param {Array<ExpenseItem>} items */
export function groupExpensesByDate(items) {
  /** @type {Map<string, Array<ExpenseItem>>} */
  const groups = new Map()
  const sorted = [...(items || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  sorted.forEach((item) => {
    const date = item.date || ''
    if (!groups.has(date)) groups.set(date, [])
    // groups.has(date)를 바로 위에서 확인했으니 get은 항상 값을 돌려준다.
    ;/** @type {Array<ExpenseItem>} */ (groups.get(date)).push(item)
  })
  return [...groups.entries()].map(([date, dayItems]) => ({
    date,
    items: dayItems,
    dailyTotal: dayItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0),
  }))
}

/**
 * @param {ExpenseItem|null|undefined} item
 * @param {string} [kindLabel]
 */
export function expenseTitle(item, kindLabel = '') {
  if (!item) return kindLabel || '내역'
  if (item.kind === 'fuel') {
    const liters = Number(item.liters) || 0
    const label = item.fuelType || item.name || '주유'
    return liters ? `${label} (${liters}L)` : label
  }
  return item.name || item.category || kindLabel || (item.kind === 'misc' ? '기타' : '정비')
}

/**
 * @param {Array<ExpenseItem>} items
 * @param {string} dateKey
 */
export function filterByDate(items, dateKey) {
  return (items || []).filter((item) => item.date === dateKey)
}

/**
 * 같은 id는 한 번만 남긴다(먼저 나온 항목). 조회/hydrate가 비용을 복제해도 배열이 안 늘어나게.
 * @template {{ id?: string }} T
 * @param {Array<T>} [items]
 * @returns {Array<T>}
 */
export function dedupeExpensesById(items) {
  const seen = new Set()
  /** @type {Array<T>} */
  const next = []
  ;(items || []).forEach((item) => {
    const id = item && typeof item.id === 'string' ? item.id : ''
    if (!id || seen.has(id)) return
    seen.add(id)
    next.push(item)
  })
  return next
}
