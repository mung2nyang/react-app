// Step 0-4 감사 보완 4차: cloudSync.js(920줄, 200줄 제한 위반)를 책임별로 분리한 조각
// 중 하나. 여기엔 "practice 스냅샷 localStorage I/O"만 모은다 — hydrate.js/직접
// mutation/outbox 실행기가 전부 이 원시 함수들을 공유한다.
export const KEYS = {
  work: 'reactPracticeWorkData',
  cars: 'reactPracticeCars',
  clients: 'reactPracticeClients',
  drivers: 'reactPracticeDrivers',
  profile: 'reactPracticeProfile',
  settings: 'reactPracticeSettings',
  expenses: 'reactPracticeExpenses',
  invoices: 'reactPracticeInvoices',
}

export function readJson(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value))
}

export function keyFor(prefix, ownerKey) {
  return `${prefix}:${ownerKey}`
}

export function parseEntityNumber(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function rangesOverlap(startA, endA, startB, endB) {
  const aEnd = endA || '9999-12-31'
  const bEnd = endB || '9999-12-31'
  return startA <= bEnd && startB <= aEnd
}

export function collectPracticeSnapshot(ownerKey) {
  return {
    workData: readJson(keyFor(KEYS.work, ownerKey), {}),
    cars: readJson(keyFor(KEYS.cars, ownerKey), []),
    clients: readJson(keyFor(KEYS.clients, ownerKey), []),
    drivers: readJson(keyFor(KEYS.drivers, ownerKey), []),
    profile: readJson(keyFor(KEYS.profile, ownerKey), {}),
    settings: readJson(keyFor(KEYS.settings, ownerKey), {}),
    expenses: readJson(keyFor(KEYS.expenses, ownerKey), []),
    invoices: readJson(keyFor(KEYS.invoices, ownerKey), []),
  }
}

export function practiceSnapshotForProfile(snapshot) {
  const { invoices: _invoices, expenses, ...rest } = snapshot
  return {
    ...rest,
    expenses: (expenses || []).filter((item) => item.kind !== 'fuel' && item.kind !== 'maint' && item.kind !== 'misc'),
  }
}

export function applyPracticeSnapshot(ownerKey, snapshot = {}) {
  if (snapshot.workData && typeof snapshot.workData === 'object') writeJson(keyFor(KEYS.work, ownerKey), snapshot.workData)
  if (Array.isArray(snapshot.cars)) writeJson(keyFor(KEYS.cars, ownerKey), snapshot.cars)
  if (Array.isArray(snapshot.clients)) writeJson(keyFor(KEYS.clients, ownerKey), snapshot.clients)
  if (Array.isArray(snapshot.drivers)) writeJson(keyFor(KEYS.drivers, ownerKey), snapshot.drivers)
  if (snapshot.profile && typeof snapshot.profile === 'object') writeJson(keyFor(KEYS.profile, ownerKey), snapshot.profile)
  if (snapshot.settings && typeof snapshot.settings === 'object') writeJson(keyFor(KEYS.settings, ownerKey), snapshot.settings)
  if (Array.isArray(snapshot.expenses)) writeJson(keyFor(KEYS.expenses, ownerKey), snapshot.expenses)
  if (Array.isArray(snapshot.invoices)) writeJson(keyFor(KEYS.invoices, ownerKey), snapshot.invoices)
}

export function buildVehicleRow(userId, car, index) {
  const logId = car.type === 'sub' ? car.number : 'main'
  const salaryDigits = String(car.driverSalaryAmount || '').replace(/\D/g, '')
  return {
    user_id: userId,
    legacy_log_id: logId,
    number: car.number || '',
    type: car.type === 'sub' ? 'sub' : 'main',
    tonnage: car.tonnage || '',
    display_order: index,
    comm_enabled: !!car.commEnabled,
    comm_type: car.commType || null,
    comm_value: car.commission != null ? String(car.commission) : null,
    settlement_mode: car.settlementMode || null,
    driver_pay_mode: car.driverPayMode || null,
    driver_salary_amount: car.driverPayMode === 'salary' && salaryDigits ? Number(salaryDigits) : null,
    driver_link_id: car.driverLinkId || null,
    driver_name: car.driverName || null,
    archived: !!car.archived,
    raw: car,
  }
}

/**
 * 행 소유자 = ownerKey, 로그인한 사람의 auth id 아님.
 * 소속기사 세션에서도 거래처는 연동된 차주(ownerKey)의 소유로 저장된다.
 * @param {string} ownerId
 * @param {import('../domain/clientTypes.js').ClientLike} client
 * @param {number} index
 */
export function buildClientRow(ownerId, client, index) {
  return {
    user_id: ownerId,
    legacy_client_id: client.id || null,
    company_name: client.companyName,
    manager_name: client.managerName || null,
    biz_number: client.bizNumber || null,
    phone: client.phone || null,
    tax_invoice_enabled: !!client.taxInvoiceEnabled,
    is_pinned: !!client.isPinned,
    comm_enabled: !!client.commEnabled,
    comm_type: client.commType || null,
    comm_value: client.commValue != null ? String(client.commValue) : null,
    payment_term: client.paymentTerm || null,
    payment_term_value: client.paymentTermValue || null,
    display_order: index,
    raw: client,
  }
}
