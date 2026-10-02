// @ts-check
// 서류 발급(9-C-1, 옛 "운송비 내역서"): 탭 [일상점검표][운송비 내역서]. 메인·기사차량(연동 포함)·연동 기사 앱 공통(/app/report, /app/logs/:번호/report).
// 보는 달은 여기서 들고 두 탭이 같이 쓴다(9-C-2). 서류 탭 줄은 각 탭 위 카드 안 달 이동 아래에 들어간다.
// [일상점검표] 탭은 그 차량 "일상점검표 사용"이 켜져 있거나 서버에 점검표가 있을 때만(로드맵 9번 ⑨) — 없으면 탭 줄 없이 운송비 내역서만(예전과 같음).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { resolveLogSettings } from '../../domain/carSettingsScope.js'
import { hasAnyDailyInspection } from '../../lib/dailyInspections.js'
import { vehicleSupabaseIdForLog } from '../../lib/mainDayLogRouting.js'
import { useOwnerSettings } from '../../store/ownerDataHooks.js'
import PageHeader from '../PageHeader.jsx'
import ReportPage from '../ReportPage.jsx'
import DailyInspectionMonthSheet from './DailyInspectionMonthSheet.jsx'
import './documents.css'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function DocumentIssuePage({ ownerKey = 'guest', onBack, showToast, onOpenMenu }) {
  const { logId: rawLogId } = useParams()
  const logKey = (rawLogId ? decodeURIComponent(rawLogId) : '') || 'main'
  const settings = resolveLogSettings(useOwnerSettings(ownerKey), logKey === 'main' ? '' : logKey)
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, logKey)
  const [hasRecords, setHasRecords] = useState(false)
  const [tab, setTab] = useState(/** @type {'inspection'|'report'} */ ('inspection'))
  const [viewDate, setViewDate] = useState(() => new Date())

  useEffect(() => {
    if (ownerKey === 'guest' || vehicleId == null) return undefined
    let alive = true
    hasAnyDailyInspection(vehicleId)
      .then((found) => { if (alive) setHasRecords(found) })
      .catch((error) => { console.error('[DocumentIssuePage] 점검표 확인 실패:', error) })
    return () => { alive = false }
  }, [ownerKey, vehicleId])

  const inspectionVisible = ownerKey !== 'guest' && vehicleId != null && (!!settings.dailyInspectionOn || hasRecords)
  const activeTab = inspectionVisible ? tab : 'report'
  const tabs = inspectionVisible ? (
    <div className="doc-tabs" role="tablist" aria-label="서류 종류">
      {(/** @type {Array<['inspection'|'report', string]>} */ ([['inspection', '일상점검표'], ['report', '운송비 내역서']])).map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={`doc-tab${activeTab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
          {label}
        </button>
      ))}
    </div>
  ) : null

  if (activeTab === 'report') {
    return <ReportPage ownerKey={ownerKey} logId={logKey} onBack={onBack} showToast={showToast} onOpenMenu={onOpenMenu} tabs={tabs} viewDate={viewDate} onChangeMonth={setViewDate} />
  }
  return (
    <div className="page report-page-wrap">
      <PageHeader title="서류 발급" onBack={onBack} onOpenMenu={onOpenMenu} />
      <DailyInspectionMonthSheet ownerKey={ownerKey} logKey={logKey} viewDate={viewDate} onChangeMonth={setViewDate} tabs={tabs} showToast={showToast} />
    </div>
  )
}
