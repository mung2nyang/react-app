// @ts-check
// 앱 공용 확인 창: 어디서든 await confirmDialog({...})로 묻고, AppShell에 한 번 붙인 <ConfirmDialogHost/>가 앱 확인 창(ConfirmModal)으로 그린다.
// 브라우저 기본 확인 창(window.confirm)이 섞여 보이지 않게 하려는 것. 그릴 곳이 없으면(테스트 등) 기본 창으로 대신 묻는다.
import { useEffect, useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'

/** @typedef {{ title: string, message?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} ConfirmRequest */
/** @typedef {{ request: ConfirmRequest, resolve: (ok: boolean) => void }} PendingConfirm */

/** @type {((pending: PendingConfirm) => void) | null} */
let showConfirm = null
// 떠 있는 질문을 "취소"로 닫는 길 — 창이 없으면 null(로드맵 63-C, 휴대폰 뒤로가기).
/** @type {(() => void) | null} */
let cancelOpen = null

export function confirmDialogOpen() {
  return cancelOpen !== null
}

export function cancelConfirmDialog() {
  cancelOpen?.()
}

/** @param {ConfirmRequest} request @returns {Promise<boolean>} */
export function confirmDialog(request) {
  if (!showConfirm) return Promise.resolve(window.confirm([request.title, request.message].filter(Boolean).join('\n')))
  const show = showConfirm
  return new Promise((resolve) => { show({ request, resolve }) })
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState(/** @type {PendingConfirm|null} */ (null))

  useEffect(() => {
    showConfirm = (next) => {
      // 앞 질문이 열려 있는데 새 질문이 오면 앞 질문은 "취소"로 끝낸다(답 없이 남지 않게).
      setPending((current) => { current?.resolve(false); return next })
    }
    return () => { showConfirm = null; cancelOpen = null }
  }, [])

  useEffect(() => {
    cancelOpen = pending ? () => { pending.resolve(false); setPending(null) } : null
  }, [pending])

  if (!pending) return null
  /** @param {boolean} ok */
  const close = (ok) => { pending.resolve(ok); setPending(null) }
  const { title, message, confirmLabel, cancelLabel, danger } = pending.request
  return (
    <ConfirmModal
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  )
}
