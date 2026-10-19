// @ts-check
/** @typedef {import('../sync/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 서버 저장 행 만들기와 번호 읽기 도우미(차량·거래처·일지 서버 저장이 공유).
/**
 * @param {JsonValue|undefined} value
 * @returns {number}
 */
export function parseEntityNumber(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {string} userId
 * @param {import('../../domain/financeTypes.js').CarLike} car
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
 * @param {import('../../domain/clientTypes.js').ClientLike} client
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
