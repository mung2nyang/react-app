// @ts-check
// 마이페이지 "데이터 다운로드 / 불러오기": 내 기록 전체를 비회원 백업과 같은 파일로 기기에 저장(B-1),
// 받아 둔 파일에서 지금 없는 일지·거래처·지출·세금계산서만 더하기(22-A·B, 덮어쓰기·삭제 없음).
import { useRef, useState } from 'react'
import { buildMemberBackupData, memberBackupBlockedReason } from '../lib/memberBackup.js'
import { applyMemberRestore, planMemberRestore } from '../lib/memberRestore.js'
import { describeRestoreCounts } from '../lib/memberRestoreRecords.js'

/** @typedef {import('../lib/memberRestore.js').RestorePlan} RestorePlan */

const TEXT_STYLE = { wordBreak: /** @type {const} */ ('keep-all'), textAlign: /** @type {const} */ ('left') }
const SUB_TEXT_STYLE = { ...TEXT_STYLE, marginTop: 10, color: 'var(--sub-text-color)', fontSize: 'var(--fs-2)' }

/** @param {Record<string, unknown>} data */
function saveJsonFile(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `운송내역_백업_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {() => void} props.onClose
 * @param {(message: string) => void} [props.showToast]
 */
export default function DataDownloadModal({ ownerKey, onClose, showToast }) {
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState(/** @type {RestorePlan|null} */ (null))
  const fileInputRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  async function download() {
    if (busy) return
    const blocked = memberBackupBlockedReason(ownerKey)
    if (blocked) {
      showToast?.(blocked)
      return
    }
    setBusy(true)
    try {
      saveJsonFile(await buildMemberBackupData(ownerKey))
      showToast?.('데이터 파일을 저장했습니다.')
      onClose()
    } catch (error) {
      console.error('데이터 다운로드 실패:', error)
      showToast?.('데이터 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setBusy(false)
    }
  }

  /** @param {import('react').ChangeEvent<HTMLInputElement>} event */
  async function pickFile(event) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    try {
      const blocked = memberBackupBlockedReason(ownerKey)
      if (blocked) {
        showToast?.(blocked)
        return
      }
      let parsed
      try {
        parsed = JSON.parse((await file.text()).replace(/^﻿/, ''))
      } catch {
        showToast?.('파일 내용이 올바르지 않습니다.')
        return
      }
      const next = planMemberRestore(ownerKey, parsed)
      if (!next.ok) showToast?.(next.error)
      else if (!describeRestoreCounts(next.counts)) showToast?.('더할 기록이 없습니다. 파일의 기록이 모두 이미 있습니다.')
      else setPlan(next)
    } catch (error) {
      console.error('데이터 불러오기 파일 읽기 실패:', error)
      showToast?.('파일을 읽지 못했습니다.')
    } finally {
      input.value = ''
    }
  }

  async function restore() {
    if (busy || !plan) return
    setBusy(true)
    try {
      const res = await applyMemberRestore(ownerKey, plan)
      const done = describeRestoreCounts(res.counts)
      if (res.ok) showToast?.(`불러왔습니다 — ${done}`)
      else if (res.toast) showToast?.(done ? `${res.toast} (먼저 저장됨: ${done})` : res.toast)
    } catch (error) {
      console.error('데이터 불러오기 실패:', error)
      showToast?.('불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
    onClose()
  }

  const close = busy ? undefined : onClose

  if (plan) {
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal-content" onClick={(event) => event.stopPropagation()}>
          <div className="modal-title">데이터 불러오기</div>
          <p className="confirm-modal-text" style={TEXT_STYLE}>
            {`이 파일에서 지금 없는 것만 더합니다.\n${describeRestoreCounts(plan.counts)}\n이미 있는 기록은 내용이 달라도 건드리지 않습니다.`}
          </p>
          {plan.skipped > 0 && (
            <p className="confirm-modal-text" style={SUB_TEXT_STYLE}>
              {'내 차량에 없거나 기사가 연동된 차량의 기록은 건너뜁니다.'}
            </p>
          )}
          <div className="modal-btns">
            <button type="button" className="modal-btn cancel" disabled={busy} onClick={onClose}>취소</button>
            <button type="button" className="modal-btn confirm" disabled={busy} onClick={() => { void restore() }}>불러오기</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">데이터 다운로드 / 불러오기</div>
        <p className="confirm-modal-text" style={TEXT_STYLE}>
          {'지금까지 입력한 운행·정산·차량 기록 전체를 내 기기로 다운로드합니다.\n세무 증빙이나 개인 보관을 위한 내보내기 기능입니다.'}
        </p>
        <p className="confirm-modal-text" style={SUB_TEXT_STYLE}>
          {'파일에는 계좌번호 등 개인정보가 들어 있으니 안전하게 보관해 주세요.\n세무 신고용 서류는 서류 발급에서 PDF·엑셀로도 받을 수 있습니다.'}
        </p>
        <p className="confirm-modal-text" style={SUB_TEXT_STYLE}>
          {'불러오기는 받아 둔 파일에서 지금 없는 일지·거래처·지출·세금계산서만 더합니다.'}
        </p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
          <button type="button" className="modal-btn cancel" disabled={busy} onClick={() => fileInputRef.current?.click()}>불러오기</button>
          <button type="button" className="modal-btn confirm" disabled={busy} onClick={() => { void download() }}>다운로드</button>
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(event) => { void pickFile(event) }} />
      </div>
    </div>
  )
}
