// @ts-check
import { useState } from 'react'
import { requestClientReorder } from '../../lib/clientMutations.js'
import { getCloudUserId } from '../../lib/cloudSession.js'

/**
 * @param {string} ownerKey
 * @param {Array<import('../../domain/clientTypes.js').ClientLike>} clients
 * @param {(message: string) => void} [showToast]
 */
export function useClientReorder(ownerKey, clients, showToast) {
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
