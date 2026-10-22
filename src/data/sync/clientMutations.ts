// 거래처 추가/수정/순서 변경. readiness 전에 Store/localStorage를 바꾸지 않는다.
// 거래처 단일 진실원: 단가·세무정보 부분 수정도 이 파일의 request*만 쓴다(saveClients 우회 금지).
//
// 로그인이면 서버 직접 1회(바뀐 행만) 후 Store(메모리)만 바꾼다. 게스트는 commitOrToast로 로컬 저장.
import {
  reorderClients,
  updateClientTaxInfo,
  upsertClient,
} from '../../domain/clients.ts'
import { blockedReasonForOwnerDataWrite } from '../cloud/cloudSession.ts'
import { isCloudClientOwner, reorderedClientIds, saveClientsToCloud } from './clientCloudSave.ts'
import { commitClients } from '../store/commitHelpers.ts'
import { STORAGE_FAIL_TOAST } from './localCommit.ts'
import type { ClientDraft, ClientLike } from '../../domain/clientTypes.ts'

function commitOrToast(ownerKey: string, previous: Array<ClientLike>, next: Array<ClientLike>, okToast: string | null, logLabel: string) {
  try {
    commitClients(ownerKey, next)
    return { clients: next, toast: okToast, failed: false }
  } catch (error) {
    console.error(logLabel, error)
    return { clients: previous, toast: STORAGE_FAIL_TOAST, failed: true }
  }
}

/** previous/next를 참조 동일성으로 비교해 실제로 바뀐(=새 객체가 된) 거래처 id 목록. */
function changedClientIds(previous: Array<ClientLike>, next: Array<ClientLike>): Array<string> {
  const ids: Array<string> = []
  next.forEach((item, index) => {
    if (item.id && item !== previous[index]) ids.push(item.id)
  })
  return ids
}

/** 이번 저장으로 고정노선이 켜짐 → 꺼짐이 된 다른 거래처 id(순서가 바뀌어도 id로 비교). */
function unlinkedFixedRouteIds(previous: Array<ClientLike>, next: Array<ClientLike>, savedId: string): Array<string> {
  const wasLinked = new Set(previous.filter((item) => item.fixedRouteLinked && item.id).map((item) => item.id))
  return next
    .filter((item) => item.id !== savedId && wasLinked.has(item.id) && !item.fixedRouteLinked)
    .map((item) => (item.id) as string)
}

export async function requestClientSave({ ownerKey, clients, draft, editingId, userId }: { ownerKey: string, clients: Array<ClientLike>, draft: ClientDraft, editingId: string | null, userId?: string | null }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { clients, toast: blocked, failed: true, saved: null }
  const result = upsertClient(clients, draft, editingId)
  if (result.error) return { clients, toast: result.error, failed: true, saved: null }
  const okToast = editingId ? '거래처를 수정했습니다.' : '거래처를 등록했습니다.'
  const savedFrom = (list: Array<ClientLike>) => list.find((item) => item.id === result.id) || null
  if (isCloudClientOwner(ownerKey)) {
    // 1곳 규칙으로 자동 해제된 거래처도 서버에 함께 저장해야 새로고침 때 되살아나지 않는다.
    const changedIds = result.id ? [result.id, ...unlinkedFixedRouteIds(clients, result.clients, result.id)] : []
    const out = await saveClientsToCloud({
      ownerKey, userId, previous: clients, next: result.clients, changedIds, okToast,
    })
    return { ...out, saved: out.failed ? null : savedFrom(out.clients) }
  }
  const committed = commitOrToast(
    ownerKey, clients, result.clients, okToast, '[clientMutations] 거래처 저장 실패:',
  )
  return { ...committed, saved: committed.failed ? null : savedFrom(result.clients) }
}

export async function requestClientReorder({ ownerKey, clients, fromId, toId, userId }: { ownerKey: string, clients: Array<ClientLike>, fromId: string, toId: string, userId?: string | null }) {
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
  if (isCloudClientOwner(ownerKey)) {
    const out = await saveClientsToCloud({
      ownerKey, userId, previous: clients, next,
      changedIds: reorderedClientIds(clients, next), okToast: null,
    })
    return { ...out, rejected: false }
  }
  return {
    ...commitOrToast(ownerKey, clients, next, null, '[clientMutations] 거래처 순서 저장 실패:'),
    rejected: false,
  }
}

export async function requestClientTaxInfo({ ownerKey, clients, companyName, patch, userId }: { ownerKey: string, clients: Array<ClientLike>, companyName: string, patch: Partial<ClientLike>, userId?: string | null }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { clients, toast: blocked, failed: true }
  const next = updateClientTaxInfo(clients, companyName, patch)
  if (isCloudClientOwner(ownerKey)) {
    return saveClientsToCloud({
      ownerKey, userId, previous: clients, next,
      changedIds: changedClientIds(clients, next), okToast: null,
    })
  }
  return commitOrToast(ownerKey, clients, next, null, '[clientMutations] 거래처 세무정보 저장 실패:')
}
