export function parseEntityNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function miscItemFromExpense(expense) {
  return {
    ...(expense && typeof expense === 'object' ? expense : {}),
    name: expense?.name || expense?.category || '기타',
    fare: expense?.fare ?? expense?.cost,
    category: expense?.category || '',
  }
}

export function expenseFromMiscRecord(row, index = 0) {
  const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {}
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
  }
}

export function groupMiscExpensesByDate(expenses) {
  const grouped = {}
  ;(expenses || []).filter((item) => item?.kind === 'misc' && item.date).forEach((item) => {
    const date = String(item.date)
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(item)
  })
  return grouped
}

export function replaceMiscExpenses(expenses, miscExpenses) {
  return [...(expenses || []).filter((item) => item.kind !== 'misc'), ...(miscExpenses || [])]
}

export function buildMiscExpenseRecordRow(item, index, { dailyLogId, userId, vehicleId, workDate }) {
  const miscItem = item?.kind === 'misc' ? miscItemFromExpense(item) : { ...item, fare: item?.fare ?? item?.cost }
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
