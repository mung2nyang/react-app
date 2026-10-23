// @ts-check
// 8-C — ConfirmModal.jsx 패턴을 로컬 훅으로 추출(Context/Provider 없음).
import { useCallback, useRef, useState } from 'react'
import ConfirmModal from '../../../shared/ui/ConfirmModal.jsx'

/** @typedef {{ confirmLabel?: string, danger?: boolean, message?: string }} ConfirmOptions */
/** @typedef {{ message: string, options: ConfirmOptions, resolve: (value: boolean) => void }} PendingConfirm */

export function useConfirm() {
  const [pending, setPending] = useState(/** @type {PendingConfirm|null} */ (null))
  // 열 때 담고 닫을 때 비운다 — 그리는 중에는 건드리지 않는다.
  const pendingRef = useRef(/** @type {PendingConfirm|null} */ (null))

  const confirm = useCallback((/** @type {string} */ message, /** @type {ConfirmOptions} */ options = {}) => new Promise((resolve) => {
    const next = { message, options, resolve }
    pendingRef.current = next
    setPending(next)
  }), [])

  const close = useCallback((/** @type {boolean} */ value) => {
    const current = pendingRef.current
    if (!current) return
    pendingRef.current = null
    current.resolve(value)
    setPending(null)
  }, [])

  const confirmDialog = pending ? (
    <ConfirmModal
      title={pending.message}
      message={pending.options.message}
      confirmLabel={pending.options.confirmLabel}
      danger={pending.options.danger}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null

  return { confirm, confirmDialog }
}
