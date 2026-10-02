// @ts-check
// 서류 발급(9-C-1, 옛 "운송비 내역서"): 탭 [세금계산서][운송비 내역서][일상점검표]. 메인·기사차량(연동 포함)·연동 기사 앱 공통(/app/report, /app/logs/:번호/report).
// [세금계산서](세금계산서 정리 ②)는 그 차량 계산서만, 연동 기사 본인 앱엔 없음(차주가 발행하는 서류).
// 처음 탭: [세금계산서] → 없으면 [일상점검표](보일 때, 9-C-1 결정) → [운송비 내역서].
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
import TaxInvoiceTab from './TaxInvoiceTab.jsx'
import './documents.css'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {boolean} [props.isEmployedDriver] 연동 기사 본인 앱이면 세금계산서 탭 숨김
 */
export default function DocumentIssuePage({ ownerKey = 'guest', onBack, showToast, onOpenMenu, isEmployedDriver = false }) {
  const { logId: rawLogId } = useParams()
  const logKey = (rawLogId ? decodeURIComponent(rawLogId) : '') || 'main'
  const settings = resolveLogSettings(useOwnerSettings(ownerKey), logKey === 'main' ? '' : logKey)
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, logKey)
  const [hasRecords, setHasRecords] = useState(false)
  const [tab, setTab] = useState(/** @type {'tax'|'report'|'inspection'|null} */ (null))
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
  /** @type {Array<['tax'|'report'|'inspection', string]>} */
  const visible = [
    ...(isEmployedDriver ? [] : /** @type {Array<['tax', string]>} */ ([['tax', '세금계산서']])),
    ['report', '운송비 내역서'],
    ...(inspectionVisible ? /** @type {Array<['inspection', string]>} */ ([['inspection', '일상점검표']]) : []),
  ]
  const defaultTab = isEmployedDriver ? (inspectionVisible ? 'inspection' : 'report') : 'tax'
  const activeTab = tab && visible.some(([key]) => key === tab) ? tab : defaultTab
  const tabs = visible.length > 1 ? (
    <div className="doc-tabs" role="tablist" aria-label="서류 종류">
      {visible.map(([key, label]) => (
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
      {activeTab === 'tax'
        ? <TaxInvoiceTab ownerKey={ownerKey} logKey={logKey} viewDate={viewDate} onChangeMonth={setViewDate} tabs={tabs} showToast={showToast} />
        : <DailyInspectionMonthSheet ownerKey={ownerKey} logKey={logKey} viewDate={viewDate} onChangeMonth={setViewDate} tabs={tabs} showToast={showToast} />}
    </div>
  )
}
