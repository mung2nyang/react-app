export function parseEntityNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function fuelItemFromExpense(expense) {
  return {
    ...(expense && typeof expense === 'object' ? expense : {}),
    type: expense?.fuelType || expense?.type || expense?.name || '주유',
    cost: expense?.cost,
    subsidy: expense?.subsidy || 0,
    liter: expense?.liter ?? expense?.liters ?? 0,
    mileage: expense?.mileage || 0,
  }
}

export function expenseFromFuelRecord(row, index = 0) {
  const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {}
  const date = row?.work_date || raw.date || ''
  const fuelType = raw.fuelType || raw.type || raw.name || '주유'
  return {
    id: raw.id || `fuel-${date}-${row?.sequence ?? index}`,
    kind: 'fuel',
    date,
    name: raw.name || fuelType,
    category: raw.category || fuelType,
    fuelType,
    payment: raw.payment || '카드',
    cost: raw.cost != null ? parseEntityNumber(raw.cost) : parseEntityNumber(row?.cost_amount),
    subsidy: raw.subsidy != null ? parseEntityNumber(raw.subsidy) : parseEntityNumber(row?.subsidy_amount),
    mileage: raw.mileage != null ? parseEntityNumber(raw.mileage) : parseEntityNumber(row?.mileage_km),
    liters: raw.liters != null ? parseEntityNumber(raw.liters) : parseEntityNumber(raw.liter ?? row?.volume_liter),
  }
}

export function groupFuelExpensesByDate(expenses) {
  const grouped = {}
  ;(expenses || []).filter((item) => item?.kind === 'fuel' && item.date).forEach((item) => {
    const date = String(item.date)
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(item)
  })
  return grouped
}

export function replaceFuelExpenses(expenses, fuelExpenses) {
  return [...(expenses || []).filter((item) => item.kind !== 'fuel'), ...(fuelExpenses || [])]
}

export function buildFuelRecordRow(item, index, { dailyLogId, userId, vehicleId, workDate }) {
  const fuelItem = item?.kind === 'fuel' ? fuelItemFromExpense(item) : { ...item, liter: item?.liter ?? item?.liters }
  return {
    daily_log_id: dailyLogId,
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    sequence: index,
    cost_amount: parseEntityNumber(fuelItem.cost),
    subsidy_amount: parseEntityNumber(fuelItem.subsidy),
    volume_liter: parseEntityNumber(fuelItem.liter),
    mileage_km: parseEntityNumber(fuelItem.mileage),
    raw: fuelItem,
  }
}
