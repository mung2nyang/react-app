// 로그인 거래처 저장: 서버 성공 후에만 Store. persist·dirty·syncAll 없음.
import { assertSessionStillCurrent, captureSession, getCloudOwnerKey } from '../cloud/cloudSession.ts'
import { commitBatch } from '../store/app-store.ts'
import { StaleSessionError } from './saveErrors.ts'
import { runOwnerSaveSerialized } from './ownerSaveQueue.ts'
import { upsertClientFromList } from './syncVehiclesClients.ts'
import { SERVER_SAVE_FAIL, SESSION_CHANGED_FAIL } from '../../shared/utils/failureMessages.js'
import type { ClientLike } from '../../domain/clientTypes.ts'

export const CLIENT_SAVE_FAIL_TOAST = SERVER_SAVE_FAIL
export const CLIENT_SESSION_CHANGED_TOAST = SESSION_CHANGED_FAIL

export function isCloudClientOwner(ownerKey: string) {
  return getCloudOwnerKey() === ownerKey
}

export function reorderedClientIds(previous: Array<ClientLike>, next: Array<ClientLike>): Array<string> {
  const ids: Array<string> = []
  next.forEach((item, index) => {
    if (!item.id) return
    if (previous[index]?.id !== item.id) ids.push(item.id)
  })
  return ids
}

export function saveClientsToCloud({ ownerKey, userId, previous, next, changedIds, okToast }: { ownerKey: string, userId?: string | null, previous: Array<ClientLike>, next: Array<ClientLike>, changedIds: Array<string>, okToast: string | null }): Promise<{ clients: Array<ClientLike>, toast: string | null, failed: boolean }> {
  return runOwnerSaveSerialized(ownerKey, async () => {
    try {
      const captured = captureSession()
      let working = next
      for (const id of changedIds) {
        const remoteId = await upsertClientFromList((userId) as string, ownerKey, working, id, captured)
        if (remoteId != null) {
          working = working.map((item) => (item.id === id ? { ...item, supabaseId: String(remoteId) } : item))
        }
      }
      assertSessionStillCurrent(captured)
      commitBatch([{ domain: 'clients', ownerKey, value: working }])
      return { clients: working, toast: okToast, failed: false }
    } catch (error) {
      if (error instanceof StaleSessionError) {
        return { clients: previous, toast: CLIENT_SESSION_CHANGED_TOAST, failed: true }
      }
      console.error('[clientCloudSave] 거래처 저장 실패:', error)
      return { clients: previous, toast: CLIENT_SAVE_FAIL_TOAST, failed: true }
    }
  })
}
