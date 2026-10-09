// @ts-check
// 고정 노선 거래처 연결 팝업 — 거래처 고르기·1회 단가·파렛트 단가·저장/연결 해제. 저장은 거래처 창과 같은 requestClientSave.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import AppDropdown from './shared/AppDropdown.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import { clientToDraft } from '../domain/clientDraft.js'
import { formatCurrencyInput } from '../lib/money.js'
import { requestClientSave } from '../lib/clientMutations.js'
import { getCloudUserId } from '../lib/cloudSession.js'

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {Array<ClientLike>} props.clients 저장에 넘길 전체 목록
 * @param {Array<ClientLike>} props.candidates 이 스코프에서 고를 수 있는 거래처
 * @param {ClientLike|null} props.linked 지금 연결된 거래처
 * @param {() => void} props.onClose
 * @param {(message: string) => void} [props.showToast]
 */
export default function FixedRouteClientModal({ ownerKey, clients, candidates, linked, onClose, showToast }) {
  const [selectedId, setSelectedId] = useState(linked?.id || '')
  const [price, setPrice] = useState(formatCurrencyInput(linked?.fixedUnitPrice ?? ''))
  const [palletOn, setPalletOn] = useState(!!linked?.palletOn)
  const [palletPrice, setPalletPrice] = useState(formatCurrencyInput(linked?.palletPrice ?? ''))
  const [saving, setSaving] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  /** @param {string} id */
  function pick(id) {
    const client = candidates.find((item) => item.id === id)
    setSelectedId(id)
    setPrice(formatCurrencyInput(client?.fixedUnitPrice ?? ''))
    setPalletOn(!!client?.palletOn)
    setPalletPrice(formatCurrencyInput(client?.palletPrice ?? ''))
  }

  /** @param {ClientLike} target @param {import('../domain/clientTypes.js').ClientDraft} draft */
  async function submit(target, draft) {
    if (saving) return
    setSaving(true)
    try {
      const result = await requestClientSave({ ownerKey, userId: getCloudUserId(), clients, draft, editingId: target.id })
      if (result.toast) showToast?.(result.toast)
      if (!result.failed) onClose()
    } finally {
      setSaving(false)
    }
  }

  function save() {
    const target = candidates.find((item) => item.id === selectedId)
    if (!target) {
      showToast?.('거래처를 선택해 주세요.')
      return
    }
    void submit(target, { ...clientToDraft(target), fixedRouteLinked: true, fixedUnitPrice: price, palletOn, palletPrice: palletOn ? palletPrice : '' })
  }

  function unlink() {
    setConfirmUnlink(false)
    if (linked) void submit(linked, { ...clientToDraft(linked), fixedRouteLinked: false })
  }

  const options = candidates.map((client) => ({ value: client.id, label: client.companyName }))

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content client-modal fixed-route-client-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">고정 노선 거래처</div>
        <div className="form-group fixed-route-client-row">
          <label>거래처</label>
          <AppDropdown label="고정 노선 거래처" value={selectedId} options={options} placeholder="선택" className="app-dropdown-boxed" onChange={pick} />
        </div>
        <div className="form-group fixed-route-client-row">
          <label htmlFor="fixedRouteClientPrice">1회 단가</label>
          <span className="car-commission-input">
            <input id="fixedRouteClientPrice" inputMode="numeric" placeholder="0" value={price} onChange={(e) => setPrice(formatCurrencyInput(e.target.value))} />
            <b>원</b>
          </span>
        </div>
        <div className="setting-item">
          <label htmlFor="fixedRoutePalletOn">파렛트 단가</label>
          <label className="switch">
            <input id="fixedRoutePalletOn" type="checkbox" checked={palletOn} onChange={(e) => setPalletOn(e.target.checked)} />
            <span className="slider"></span>
          </label>
        </div>
        {palletOn && (
          <span className="car-commission-input fixed-route-client-pallet-price">
            <input id="fixedRoutePalletPrice" aria-label="파렛트 단가" inputMode="numeric" placeholder="0" value={palletPrice} onChange={(e) => setPalletPrice(formatCurrencyInput(e.target.value))} />
            <b>원</b>
          </span>
        )}
        {linked && (
          <button type="button" className="fixed-route-client-unlink" disabled={saving} onClick={() => setConfirmUnlink(true)}>연결 해제</button>
        )}
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
          <button type="button" className="modal-btn confirm" disabled={saving} onClick={save}>저장</button>
        </div>
      </div>
      {confirmUnlink && (
        <ConfirmModal title="고정 노선 거래처 연결을 해제하시겠습니까?" confirmLabel="연결 해제" danger onCancel={() => setConfirmUnlink(false)} onConfirm={unlink} />
      )}
    </div>,
    document.body,
  )
}
