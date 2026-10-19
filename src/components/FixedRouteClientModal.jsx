// @ts-check
// 고정 노선 거래처 연결 팝업 — 거래처 고르기·1회 단가·파렛트 단가·저장/연결 해제. 저장은 거래처 창과 같은 requestClientSave.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import AppDropdown from '../shared/ui/AppDropdown.jsx'
import ConfirmModal from '../shared/ui/ConfirmModal.jsx'
import { clientToDraft } from '../domain/clientDraft.js'
import { formatCurrencyInput } from '../lib/money.js'
import CurrencyInput from '../shared/ui/CurrencyInput.jsx'
import { requestClientSave } from '../lib/clientMutations.js'
import { getCloudUserId } from '../data/cloud/cloudSession.js'
import ModalShell from '../shared/ui/ModalShell.jsx'
import FieldError, { focusField } from '../shared/ui/FieldError.jsx'

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
  const [missing, setMissing] = useState(false)
  // 거래처를 고르면 표시를 거둔다.
  const shown = missing && !candidates.some((item) => item.id === selectedId)
    ? { field: 'client', message: '거래처를 선택해 주세요.' }
    : null

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
    setMissing(!target)
    if (!target) {
      focusField('fixedRouteClientSelect')
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
    <>
      <ModalShell onClose={onClose} closeOnOverlay={false} closeOnEscape={false} contentClassName="modal-content client-modal fixed-route-client-modal" label="고정 노선 거래처">
        <div className="modal-title">고정 노선 거래처</div>
        <div className="form-group fixed-route-client-row">
          <label>거래처</label>
          <AppDropdown id="fixedRouteClientSelect" label="고정 노선 거래처" value={selectedId} options={options} placeholder="선택" className="app-dropdown-boxed" onChange={pick} invalid={Boolean(shown)} describedBy={shown ? 'fixedRouteClientSelect-error' : undefined} />
        </div>
        <FieldError problem={shown} field="client" inputId="fixedRouteClientSelect" />
        <div className="form-group fixed-route-client-row">
          <label htmlFor="fixedRouteClientPrice">1회 단가</label>
          <span className="car-commission-input">
            <CurrencyInput id="fixedRouteClientPrice" placeholder="0" value={price} onValueChange={setPrice} />
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
            <CurrencyInput id="fixedRoutePalletPrice" aria-label="파렛트 단가" placeholder="0" value={palletPrice} onValueChange={setPalletPrice} />
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
      </ModalShell>
      {confirmUnlink && (
        <ConfirmModal title="고정 노선 거래처 연결을 해제하시겠습니까?" confirmLabel="연결 해제" danger onCancel={() => setConfirmUnlink(false)} onConfirm={unlink} />
      )}
    </>,
    document.body,
  )
}
