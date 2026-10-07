// @ts-check
// 마이페이지 "데이터 다운로드"(B-1): 확인 창 → 내 기록 전체를 비회원 백업과 같은 파일로 기기에 저장. 내보내기만(가져오기 없음).
import { useState } from 'react'
import { buildMemberBackupData, memberBackupBlockedReason } from '../lib/memberBackup.js'

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">데이터 다운로드</div>
        <p className="confirm-modal-text" style={{ wordBreak: 'keep-all', textAlign: 'left' }}>
          {'지금까지 입력한 운행·정산·차량 기록 전체를 내 기기로 다운로드합니다.\n세무 증빙이나 개인 보관을 위한 내보내기 기능입니다.'}
        </p>
        <p className="confirm-modal-text" style={{ wordBreak: 'keep-all', textAlign: 'left', marginTop: 10, color: 'var(--sub-text-color)', fontSize: 'var(--fs-2)' }}>
          {'파일에는 계좌번호 등 개인정보가 들어 있으니 안전하게 보관해 주세요.\n세무 신고용 서류는 서류 발급에서 PDF·엑셀로도 받을 수 있습니다.'}
        </p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
          <button type="button" className="modal-btn confirm" disabled={busy} onClick={() => { void download() }}>다운로드</button>
        </div>
      </div>
    </div>
  )
}
