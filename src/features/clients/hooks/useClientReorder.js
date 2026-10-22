// @ts-check
import { useState } from 'react'
import { requestClientReorder } from '../../../data/sync/clientMutations.ts'
import { getCloudUserId } from '../../../data/cloud/cloudSession.ts'
import { useToast } from '../../../shared/hooks/useToast.js'

/**
 * @param {string} ownerKey
 * @param {Array<import('../../../domain/clientTypes.ts').ClientLike>} clients
 */
export function useClientReorder(ownerKey, clients) {
  const showToast = useToast()
  const [dragId, setDragId] = useState(/** @type {string|null} */ (null))

  /** @param {string} id */
  function onDragStart(id) {
    setDragId(id)
  }

  /** @param {string} targetId */
  async function onDrop(targetId) {
    if (!dragId) return
    setDragId(null)
    const result = await requestClientReorder({ ownerKey, userId: getCloudUserId(), clients, fromId: dragId, toId: targetId })
    if (result.toast) showToast?.(result.toast)
  }

  function onDragEnd() {
    setDragId(null)
  }

  return { dragId, onDragStart, onDrop, onDragEnd }
}
