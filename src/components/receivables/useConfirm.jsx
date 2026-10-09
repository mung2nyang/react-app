// @ts-check
// 8-C — ConfirmModal.jsx 패턴을 로컬 훅으로 추출(Context/Provider 없음).
import { useCallback, useRef, useState } from 'react'
import ConfirmModal from '../ConfirmModal.jsx'

/** @typedef {{ confirmLabel?: string, danger?: boolean }} ConfirmOptions */
/** @typedef {{ message: string, options: ConfirmOptions, resolve: (value: boolean) => void }} PendingConfirm */

export function useConfirm() {
  const [pending, setPending] = useState(/** @type {PendingConfirm|null} */ (null))
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const confirm = useCallback((/** @type {string} */ message, /** @type {ConfirmOptions} */ options = {}) => new Promise((resolve) => {
    setPending({ message, options, resolve })
  }), [])

  const close = useCallback((/** @type {boolean} */ value) => {
    const current = pendingRef.current
    if (!current) return
    current.resolve(value)
    setPending(null)
  }, [])

  const confirmDialog = pending ? (
    <ConfirmModal
      title={pending.message}
      confirmLabel={pending.options.confirmLabel}
      danger={pending.options.danger}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null

  return { confirm, confirmDialog }
}
