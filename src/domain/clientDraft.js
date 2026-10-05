// @ts-check
// 저장된 거래처 → upsertClient용 draft. 빠진 칸은 저장 때 빈 값으로 덮이므로 전 필드를 그대로 옮긴다.

/** @typedef {import('./clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('./clientTypes.js').ClientDraft} ClientDraft */

/**
 * @param {ClientLike} client
 * @returns {ClientDraft}
 */
export function clientToDraft(client) {
  return {
    companyName: client.companyName || '',
    managerName: client.managerName || '',
    phone: client.phone || '',
    bizNumber: client.bizNumber || '',
    taxRepresentative: client.taxRepresentative || '',
    taxEmail: client.taxEmail || '',
    taxAddress: client.taxAddress || '',
    taxBizType: client.taxBizType || '',
    taxBizItem: client.taxBizItem || '',
    paymentTerm: client.paymentTerm || 'next_month_end',
    paymentTermValue: client.paymentTermValue || '',
    isPinned: !!client.isPinned,
    commEnabled: !!client.commEnabled,
    commType: client.commType === 'direct' ? 'direct' : 'percent',
    commValue: String(client.commValue ?? ''),
    fixedRouteLinked: !!client.fixedRouteLinked,
    fixedUnitPrice: String(client.fixedUnitPrice ?? ''),
    palletOn: !!client.palletOn,
    palletPrice: String(client.palletPrice ?? ''),
    ...(client.scopedToVehicleNumber ? { scopedToVehicleNumber: client.scopedToVehicleNumber } : {}),
  }
}

/**
 * 고정노선 연결 후보: 스코프 키가 있으면 그 차량번호 거래처, 없으면 스코프 없는(차주 본인) 거래처.
 * @param {Array<ClientLike>} clients
 * @param {string} scopeKey
 */
export function fixedRouteCandidates(clients, scopeKey) {
  const key = String(scopeKey || '').trim()
  return clients.filter((client) => (key ? client.scopedToVehicleNumber === key : !client.scopedToVehicleNumber))
}
