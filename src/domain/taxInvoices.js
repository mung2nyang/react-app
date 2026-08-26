export function parseEntityNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export const TAX_INVOICE_VEHICLE_RETRY_ERROR = '차량 정보가 아직 서버에 등록되지 않았습니다. 잠시 후 다시 시도해 주세요.'

export function resolveTaxInvoiceVehicleId(item, settings = {}) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const carNumber = item?.carNumber || (Array.isArray(item?.vehicleNumbers) ? item.vehicleNumbers[0] : null)
  if (carNumber) {
    const car = cars.find((entry) => entry.number === carNumber)
    return car?.supabaseId || null
  }
  const mainCar = cars.find((entry) => entry.type === 'main')
  return mainCar?.supabaseId || null
}

export function matchTaxInvoiceClientId(item, clients = []) {
  const matched = (clients || []).find((client) => client.companyName === item?.clientName)
  return matched?.supabaseId || null
}

export function buildTaxInvoiceRow(item, { userId, vehicleId, clientId }) {
  return {
    user_id: userId,
    vehicle_id: vehicleId,
    client_id: clientId || null,
    flow: item?.flow || null,
    month_key: item?.monthKey || null,
    supply_amount: parseEntityNumber(item?.supplyAmount),
    tax_amount: parseEntityNumber(item?.taxAmount),
    total_amount: parseEntityNumber(item?.totalAmount),
    status: item?.status || 'draft',
    raw: item,
  }
}

export function mergeTaxInvoiceRecords(localRecords, rows) {
  const merged = [...(localRecords || [])]
  ;(rows || []).forEach((row) => {
    const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {}
    if (!raw.id) return
    const record = { ...raw, supabaseId: row.id }
    const index = merged.findIndex((item) => item.id === record.id)
    if (index >= 0) merged[index] = record
    else merged.push(record)
  })
  return merged
}

export function applyInsertedTaxInvoiceId(records, localId, supabaseId) {
  return (records || []).map((item) => (item.id === localId ? { ...item, supabaseId } : item))
}
