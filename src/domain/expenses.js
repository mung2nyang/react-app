// Step 4 도메인 폴더 이동: expenses.js의 순수 계산부. localStorage I/O(loadExpenses/
// saveExpenses)는 lib/expenses.js에 남아 이 파일을 재수출한다.
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

export function monthPrefix(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function filterMonth(items, kind, year, monthIndex) {
  const prefix = monthPrefix(year, monthIndex)
  return (items || [])
    .filter((item) => item.kind === kind && String(item.date || '').startsWith(prefix))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

export function monthTotal(items, kind, year, monthIndex) {
  return filterMonth(items, kind, year, monthIndex).reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
}

export function emptyExpenseDraft(kind, date = todayKey()) {
  return {
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
}

export function upsertExpense(items, draft, editingId = null) {
  const kind = ['maint', 'fuel', 'misc'].includes(draft.kind) ? draft.kind : 'maint'
  const date = String(draft.date || '').trim()
  const name = String(draft.name || '').trim()
  const category = String(draft.category || '').trim()
  const fuelType = FUEL_TYPES.includes(draft.fuelType) ? draft.fuelType : '주유'
  const payment = draft.payment === '현금' ? '현금' : '카드'
  const cost = Math.max(0, parseInt(draft.cost, 10) || 0)
  const subsidy = Math.max(0, parseInt(draft.subsidy, 10) || 0)
  const mileage = Math.max(0, parseInt(draft.mileage, 10) || 0)
  const liters = Math.max(0, Number.parseFloat(draft.liters) || 0)

  if (!date) return { error: '날짜를 선택해 주세요.', items }
  if (kind === 'fuel') {
    if (!cost) return { error: '비용을 입력해 주세요.', items }
  } else if (!name && !cost) {
    return { error: '항목명 또는 비용을 입력해 주세요.', items }
  }

  const next = {
    kind,
    date,
    name: kind === 'fuel' ? fuelType : name,
    category: kind === 'fuel' ? fuelType : category,
    fuelType,
    payment,
    cost,
    subsidy: kind === 'fuel' ? subsidy : 0,
    mileage,
    liters: kind === 'fuel' ? liters : 0,
  }
  const list = [...(items || [])]

  if (editingId) {
    const idx = list.findIndex((item) => item.id === editingId)
    if (idx < 0) return { error: '내역을 찾지 못했습니다.', items }
    list[idx] = { ...list[idx], ...next }
    return { items: list }
  }

  list.push({ id: `exp-${Date.now()}`, ...next })
  return { items: list }
}

export function removeExpense(items, id) {
  return (items || []).filter((item) => item.id !== id)
}

export function groupExpensesByDate(items) {
  const groups = new Map()
  const sorted = [...(items || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  sorted.forEach((item) => {
    const date = item.date || ''
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date).push(item)
  })
  return [...groups.entries()].map(([date, dayItems]) => ({
    date,
    items: dayItems,
    dailyTotal: dayItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0),
  }))
}

export function expenseTitle(item, kindLabel = '') {
  if (!item) return kindLabel || '내역'
  if (item.kind === 'fuel') {
    const liters = Number(item.liters) || 0
    const label = item.fuelType || item.name || '주유'
    return liters ? `${label} (${liters}L)` : label
  }
  return item.name || item.category || kindLabel || (item.kind === 'misc' ? '기타' : '정비')
}

export function filterByDate(items, dateKey) {
  return (items || []).filter((item) => item.date === dateKey)
}
