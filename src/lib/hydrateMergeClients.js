// @ts-check
// Step 7 후속(재감사) — mergeCarsFromRows와 같은 이유(hydrateMergeCars.js 상단 주석
// 참고)로 hydrateMerge.js에서 뺐다: `...raw` 스프레드가 정본 밖 필드/타입을 그대로
// 들여오면 다음 initialize에서 clients 도메인 전체가 스키마 실패로 사라진다. 여기서도
// CLIENT_KEYS(store/persistDomainRecords.js)에 있는 필드만 정본 타입으로 정규화한다.
import { COMM_TYPES, PAYMENT_TERM_VALUES, isAllowedEnum } from '../store/persistDomainEnums.js'
import { isStringOrFiniteNumber } from '../store/persistDomainRecords.js'

/** @typedef {import('./hydrateMergeTypes.js').LocalClient} LocalClient */
/** @typedef {import('./hydrateMergeTypes.js').RawClientBackup} RawClientBackup */
/** @typedef {import('./hydrateMergeTypes.js').ClientRow} ClientRow */

/** @param {string|undefined} value */
function stringOrEmpty(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {boolean|undefined} value */
function boolOrFalse(value) {
  return typeof value === 'boolean' ? value : false
}

/** @param {string|number|undefined} value */
function numericOrEmpty(value) {
  return value !== undefined && isStringOrFiniteNumber(value) ? value : ''
}

/** @param {Array<LocalClient>} localClients @param {Array<ClientRow>|null|undefined} clientRows */
export function mergeClientsFromRows(localClients, clientRows) {
  // 슬라이스 C(2026-09-01): clientRows가 배열이면(빈 배열 포함) 서버가 정본이다.
  // 빈 배열을 로컬로 되돌리면 방금 삭제한 거래처가 hydrate 뒤 부활한다. fallback은
  // 조회 실패로 배열이 아닐 때만. 빈 배열은 map을 통과해 []가 되고 미동기화 로컬만 덧붙는다.
  if (!Array.isArray(clientRows)) return Array.isArray(localClients) ? localClients : []
  const clients = clientRows.map((row) => {
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : /** @type {RawClientBackup} */ ({})
    /** @type {LocalClient} */
    const client = {
      id: row.legacy_client_id || String(row.id),
      companyName: row.company_name || '',
      supabaseId: row.id,
      isPinned: row.is_pinned ?? boolOrFalse(raw.isPinned),
      managerName: stringOrEmpty(raw.managerName),
      phone: stringOrEmpty(raw.phone),
      bizNumber: stringOrEmpty(raw.bizNumber),
      scopedToVehicleNumber: stringOrEmpty(raw.scopedToVehicleNumber),
      commEnabled: boolOrFalse(raw.commEnabled),
      commType: typeof raw.commType === 'string' && isAllowedEnum(raw.commType, COMM_TYPES) ? raw.commType : 'percent',
      commValue: numericOrEmpty(raw.commValue),
      fixedRouteLinked: boolOrFalse(raw.fixedRouteLinked),
      palletOn: boolOrFalse(raw.palletOn),
      palletPrice: numericOrEmpty(raw.palletPrice),
      fixedUnitPrice: numericOrEmpty(raw.fixedUnitPrice),
      paymentTermValue: stringOrEmpty(raw.paymentTermValue),
      taxRepresentative: stringOrEmpty(raw.taxRepresentative),
      taxEmail: stringOrEmpty(raw.taxEmail),
      taxAddress: stringOrEmpty(raw.taxAddress),
      taxBizType: stringOrEmpty(raw.taxBizType),
      taxBizItem: stringOrEmpty(raw.taxBizItem),
    }
    // paymentTerm은 CAR_KEYS의 settlementMode와 달리 "값 없음"을 뜻하는 정본 enum
    // 멤버가 없다(PAYMENT_TERM_VALUES 6개 전부 실제 결제조건이다) — 빈 문자열
    // 기본값을 주면 그 자체가 스키마 위반이라, 유효할 때만 키를 채우고 아니면 아예
    // 생략한다(나머지 필드는 정상 정규화).
    if (typeof raw.paymentTerm === 'string' && isAllowedEnum(raw.paymentTerm, PAYMENT_TERM_VALUES)) {
      client.paymentTerm = raw.paymentTerm
    }
    return client
  })
  const unsynced = (localClients || []).filter((client) => client && !client.supabaseId)
  return [...clients, ...unsynced]
}
