// @ts-check
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

/**
 * @param {string} storageKey
 * @param {unknown} fallback
 * @returns {unknown}
 */
export function readJson(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

/**
 * @param {string} storageKey
 * @param {unknown} value
 * @returns {void}
 */
export function writeJson(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value))
}

/**
 * @param {string} prefix
 * @param {string} ownerKey
 * @returns {string}
 */
export function keyFor(prefix, ownerKey) {
  return `${prefix}:${ownerKey}`
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function parseEntityNumber(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {string} startA
 * @param {string} endA
 * @param {string} startB
 * @param {string} endB
 * @returns {boolean}
 */
export function rangesOverlap(startA, endA, startB, endB) {
  const aEnd = endA || '9999-12-31'
  const bEnd = endB || '9999-12-31'
  return startA <= bEnd && startB <= aEnd
}

/**
 * @param {string} userId
 * @param {import('../domain/financeTypes.js').CarLike} car
 * @param {number} index
 */
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
