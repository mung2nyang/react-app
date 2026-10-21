// @ts-check
// 지출 입력값 만들기·저장 전 검사·목록 고치기(차량 유지비 화면과 운행일지 비용 칸이 같이 씀).
import { generateLocalId } from './localId.js'
import { FUEL_TYPES, MAINT_CATEGORIES, MISC_CATEGORIES, todayKey } from './expenses.js'
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('./expenseTypes.js').ExpenseDraft} ExpenseDraft */

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
