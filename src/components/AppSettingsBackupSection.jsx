// @ts-check
// 게스트 전용 데이터 관리(백업/복구) — AppSettingsPage에서 분리(§6 200줄).
import { useRef, useState } from 'react'
import { applyGuestBackupData, buildGuestBackupData, getLastBackupAt, markBackupDone } from '../lib/guestBackup.js'

const BACKUP_UPLOAD_ICON = (
  <svg className="inline-icon sm" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
)

const BACKUP_DOWNLOAD_ICON = (
  <svg className="inline-icon sm" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
)

/** @param {string|null} iso */
function formatBackupStatus(iso) {
  if (!iso) return '아직 백업한 적 없음'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '아직 백업한 적 없음'
  return `마지막 백업: ${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

/**
 * @param {Object} props
 * @param {(message: string) => void} [props.showToast]
 */
export default function AppSettingsBackupSection({ showToast }) {
  const fileInputRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const [lastBackupAt, setLastBackupAt] = useState(() => getLastBackupAt())

  function handleExport() {
    try {
      const data = buildGuestBackupData()
      markBackupDone()
      setLastBackupAt(getLastBackupAt())
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      if (typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const todayStr = new Date().toISOString().slice(0, 10)
        a.href = url
        a.download = `운송내역_백업_${todayStr}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      showToast?.('백업 파일을 저장했습니다.')
    } catch (error) {
      console.error('백업 내보내기 실패:', error)
      showToast?.('백업 파일 생성에 실패했습니다.')
    }
  }

  /**
   * @param {import('react').ChangeEvent<HTMLInputElement>} e
   */
  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      let parsed
      try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
      } catch {
        showToast?.('파일 내용이 손상되었거나 JSON 파일이 아닙니다.')
        return
      }
      const res = applyGuestBackupData(parsed)
      if (!res.ok) {
        showToast?.(res.error || '백업 데이터를 복원하지 못했습니다.')
        return
      }
      showToast?.('백업 데이터를 복원했습니다.')
    } catch (err) {
      console.error('백업 불러오기 실패:', err)
      showToast?.('백업 파일을 읽지 못했습니다.')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <section className="setting-section settings-backup-card">
      <h3>데이터 관리 (백업 / 복구)</h3>
      <p className="car-type-hint" style={{ marginTop: 4, marginBottom: 10 }}>
        운행일지, 기사 연동 기록, 세금계산서와 설정을 함께 보관하고 복원합니다.
      </p>
      <div className="last-backup-status">{formatBackupStatus(lastBackupAt)}</div>
      <div className="backup-btn-group">
        <button type="button" className="backup-btn" onClick={handleExport}>
          {BACKUP_UPLOAD_ICON} 백업 저장하기
        </button>
        <button type="button" className="backup-btn" onClick={() => fileInputRef.current?.click()}>
          {BACKUP_DOWNLOAD_ICON} 백업 불러오기
        </button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImport} />
      </div>
    </section>
  )
}
