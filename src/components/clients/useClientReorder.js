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
  function onDrop(targetId) {
    if (!dragId) return
    const result = requestClientReorder({ ownerKey, userId: getCloudUserId(), clients, fromId: dragId, toId: targetId })
    if (result.toast) showToast?.(result.toast)
    setDragId(null)
  }

  function onDragEnd() {
    setDragId(null)
  }

  return { dragId, onDragStart, onDrop, onDragEnd }
}
