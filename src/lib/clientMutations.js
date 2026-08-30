// @ts-check
// Step 7: 거래처 추가/수정/순서 변경. readiness 전에 Store/localStorage를 바꾸지 않는다.
// 거래처 단일 진실원: 단가·세무정보 부분 수정도 이 파일의 request*만 쓴다(saveClients 우회 금지).
import {
  reorderClients,
  updateClientFixedUnitPrice,
  updateClientTaxInfo,
  upsertClient,
} from '../domain/clients.js'
import { blockedReasonForOwnerDataWrite } from './cloudSession.js'
import { commitClients } from '../store/commitHelpers.js'
import { STORAGE_FAIL_TOAST } from './outboxCommit.js'

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/clientTypes.js').ClientDraft} ClientDraft */

/**
 * @param {string} ownerKey
 * @param {Array<ClientLike>} previous
 * @param {Array<ClientLike>} next
 * @param {string|null} okToast
 * @param {string} logLabel
 */
function commitOrToast(ownerKey, previous, next, okToast, logLabel) {
  try {
    commitClients(ownerKey, next)
    return { clients: next, toast: okToast, failed: false }
  } catch (error) {
    console.error(logLabel, error)
    return { clients: previous, toast: STORAGE_FAIL_TOAST, failed: true }
  }
}

/**
 * @param {{ ownerKey: string, clients: Array<ClientLike>, draft: ClientDraft, editingId: string|null, userId?: string|null }} params
 */
export function requestClientSave({ ownerKey, clients, draft, editingId, userId }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { clients, toast: blocked, failed: true, saved: null }
  const result = upsertClient(clients, draft, editingId)
  if (result.error) return { clients, toast: result.error, failed: true, saved: null }
  const committed = commitOrToast(
    ownerKey, clients, result.clients,
    editingId ? '거래처를 수정했습니다.' : '거래처를 등록했습니다.',
    '[clientMutations] 거래처 저장 실패:',
  )
  return {
    ...committed,
    saved: committed.failed ? null : (result.clients.find((item) => item.id === result.id) || null),
  }
}

/**
 * @param {{ ownerKey: string, clients: Array<ClientLike>, fromId: string, toId: string, userId?: string|null }} params
 */
export function requestClientReorder({ ownerKey, clients, fromId, toId, userId }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { clients, toast: blocked, failed: true, rejected: true }
  if (fromId === toId) return { clients, toast: null, failed: false, rejected: true }
  const from = clients.find((item) => item.id === fromId)
  const to = clients.find((item) => item.id === toId)
  if (from && to && !!from.isPinned !== !!to.isPinned) {
    return { clients, toast: '즐겨찾기와 일반 거래처 사이에서는 순서를 바꿀 수 없습니다.', failed: false, rejected: true }
  }
  const next = reorderClients(clients, fromId, toId)
  const unchanged = next.length === clients.length && next.every((item, index) => item.id === clients[index].id)
  if (unchanged) return { clients, toast: null, failed: false, rejected: true }
  return {
    ...commitOrToast(ownerKey, clients, next, null, '[clientMutations] 거래처 순서 저장 실패:'),
    rejected: false,
  }
}

/**
 * @param {{ ownerKey: string, clients: Array<ClientLike>, clientId: string, nextPrice: number|string, userId?: string|null }} params
 */
export function requestClientFixedUnitPrice({ ownerKey, clients, clientId, nextPrice, userId }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { clients, toast: blocked, failed: true }
  const next = updateClientFixedUnitPrice(clients, clientId, nextPrice)
  return commitOrToast(ownerKey, clients, next, null, '[clientMutations] 거래처 단가 저장 실패:')
}

/**
 * @param {{ ownerKey: string, clients: Array<ClientLike>, companyName: string, patch: Partial<ClientLike>, userId?: string|null }} params
 */
export function requestClientTaxInfo({ ownerKey, clients, companyName, patch, userId }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { clients, toast: blocked, failed: true }
  const next = updateClientTaxInfo(clients, companyName, patch)
  return commitOrToast(ownerKey, clients, next, null, '[clientMutations] 거래처 세무정보 저장 실패:')
}
