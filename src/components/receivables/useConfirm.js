// @ts-check
// 8-C — ConfirmModal.jsx 패턴을 로컬 훅으로 추출(Context/Provider 없음).
import { useCallback, useRef, useState } from 'react'
import ConfirmModal from '../ConfirmModal.jsx'

/** @typedef {{ message: string, resolve: (value: boolean) => void }} PendingConfirm */

export function useConfirm() {
  const [pending, setPending] = useState(/** @type {PendingConfirm|null} */ (null))
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const confirm = useCallback((/** @type {string} */ message) => new Promise((resolve) => {
    setPending({ message, resolve })
  }), [])

  const close = useCallback((/** @type {boolean} */ value) => {
    const current = pendingRef.current
    if (!current) return
    current.resolve(value)
    setPending(null)
  }, [])

  const confirmDialog = pending ? (
    <ConfirmModal
      message={pending.message}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null

  return { confirm, confirmDialog }
}
