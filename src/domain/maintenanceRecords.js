export function parseEntityNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function maintItemFromExpense(expense) {
  return {
    ...(expense && typeof expense === 'object' ? expense : {}),
    name: expense?.name || expense?.category || '정비',
    fare: expense?.fare ?? expense?.cost,
    mileage: expense?.mileage || 0,
    category: expense?.category || '',
  }
}

export function expenseFromMaintenanceRecord(row, index = 0) {
  const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {}
  const date = row?.work_date || raw.date || ''
  const name = raw.name || raw.category || '정비'
  return {
    id: raw.id || `maint-${date}-${row?.sequence ?? index}`,
    kind: 'maint',
    date,
    name,
    category: raw.category || '',
    fuelType: raw.fuelType || '주유',
    payment: raw.payment || '카드',
    cost: raw.cost != null ? parseEntityNumber(raw.cost) : parseEntityNumber(raw.fare ?? row?.cost_amount),
    subsidy: raw.subsidy != null ? parseEntityNumber(raw.subsidy) : 0,
    mileage: raw.mileage != null ? parseEntityNumber(raw.mileage) : parseEntityNumber(row?.mileage_km),
    liters: raw.liters != null ? parseEntityNumber(raw.liters) : 0,
  }
}

export function groupMaintExpensesByDate(expenses) {
  const grouped = {}
  ;(expenses || []).filter((item) => item?.kind === 'maint' && item.date).forEach((item) => {
    const date = String(item.date)
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(item)
  })
  return grouped
}

export function replaceMaintExpenses(expenses, maintExpenses) {
  return [...(expenses || []).filter((item) => item.kind !== 'maint'), ...(maintExpenses || [])]
}

export function buildMaintenanceRecordRow(item, index, { dailyLogId, userId, vehicleId, workDate }) {
  const maintItem = item?.kind === 'maint' ? maintItemFromExpense(item) : { ...item, fare: item?.fare ?? item?.cost }
  return {
    daily_log_id: dailyLogId,
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    sequence: index,
    cost_amount: parseEntityNumber(maintItem.fare),
    mileage_km: parseEntityNumber(maintItem.mileage),
    raw: maintItem,
  }
}
