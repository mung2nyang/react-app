// @ts-check
// 로그인 거래처 저장: 서버 성공 후에만 Store. persist·dirty·syncAll 없음.
import { assertSessionStillCurrent, captureSession, getCloudOwnerKey } from '../data/cloud/cloudSession.js'
import { commitBatch } from '../data/store/app-store.js'
import { StaleSessionError } from './outboxErrors.js'
import { runOwnerSaveSerialized } from './ownerSaveQueue.js'
import { upsertClientFromList } from './syncVehiclesClients.js'
import { SERVER_SAVE_FAIL, SESSION_CHANGED_FAIL } from './failureMessages.js'

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

export const CLIENT_SAVE_FAIL_TOAST = SERVER_SAVE_FAIL
export const CLIENT_SESSION_CHANGED_TOAST = SESSION_CHANGED_FAIL

/** @param {string} ownerKey */
export function isCloudClientOwner(ownerKey) {
  return getCloudOwnerKey() === ownerKey
}

/**
 * @param {Array<ClientLike>} previous @param {Array<ClientLike>} next
 * @returns {Array<string>}
 */
export function reorderedClientIds(previous, next) {
  /** @type {Array<string>} */
  const ids = []
  next.forEach((item, index) => {
    if (!item.id) return
    if (previous[index]?.id !== item.id) ids.push(item.id)
  })
  return ids
}

/**
 * @param {{ ownerKey: string, userId?: string|null, previous: Array<ClientLike>, next: Array<ClientLike>, changedIds: Array<string>, okToast: string|null }} params
 * @returns {Promise<{ clients: Array<ClientLike>, toast: string|null, failed: boolean }>}
 */
export function saveClientsToCloud({ ownerKey, userId, previous, next, changedIds, okToast }) {
  return runOwnerSaveSerialized(ownerKey, async () => {
    try {
      const captured = captureSession()
      let working = next
      for (const id of changedIds) {
        const remoteId = await upsertClientFromList(/** @type {string} */ (userId), ownerKey, working, id, captured)
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
