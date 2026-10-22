// CLIENT_KEYS에 있는 필드만 정본 타입으로 정규화한다(이유는 hydrateMergeCars.ts 상단과 같다).
import { COMM_TYPES, PAYMENT_TERM_VALUES, isAllowedEnum } from '../store/persistDomainEnums.ts'
import { isStringOrFiniteNumber } from '../store/persistDomainRecords.ts'
import type { ClientRow, LocalClient, RawClientBackup } from './hydrateMergeTypes.ts'

function stringOrEmpty(value: string | undefined) {
  return typeof value === 'string' ? value : ''
}

function boolOrFalse(value: boolean | undefined) {
  return typeof value === 'boolean' ? value : false
}

function numericOrEmpty(value: string | number | undefined) {
  return value !== undefined && isStringOrFiniteNumber(value) ? value : ''
}

export function mergeClientsFromRows(localClients: Array<LocalClient>, clientRows: Array<ClientRow> | null | undefined) {
  // clientRows가 배열이면(빈 배열 포함) 서버가 정본이다.
  // 빈 배열을 로컬로 되돌리면 방금 삭제한 거래처가 hydrate 뒤 부활한다. fallback은
  // 조회 실패로 배열이 아닐 때만. 빈 배열은 map을 통과해 []가 되고 미동기화 로컬만 덧붙는다.
  if (!Array.isArray(clientRows)) return Array.isArray(localClients) ? localClients : []
  const clients = clientRows.map((row) => {
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : ({}) as RawClientBackup
    const client: LocalClient = {
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
    // paymentTerm엔 "값 없음" enum 멤버가 없어 빈 문자열 기본값은 스키마 위반 — 유효할 때만 키를 채우고 아니면 생략한다.
    if (typeof raw.paymentTerm === 'string' && isAllowedEnum(raw.paymentTerm, PAYMENT_TERM_VALUES)) {
      client.paymentTerm = raw.paymentTerm
    }
    return client
  })
  const unsynced = (localClients || []).filter((client) => client && !client.supabaseId)
  return [...clients, ...unsynced]
}
