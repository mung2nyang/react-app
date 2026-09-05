// @ts-check
// 기사 관리 화면(조회 전용, Step 9 슬라이스 A). 프로필·정산·계산서 섹션을 한 파일에
// 둔다(AGENTS §6 응집도). ≤250줄.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAssignmentState } from '../../domain/drivers.js'
import {
  getLinkedDriverClientInvoiceGroups,
  getLinkedDriverSettlementDetail,
} from '../../domain/finance.js'
import { getYearOptions, setYearMonth, shiftMonth } from '../../lib/calendar.js'
import { formatWon } from '../../lib/money.js'
import { buildFinanceSettings } from '../../lib/ownerFinance.js'
import {
  useOwnerCars,
  useOwnerClients,
  useOwnerDrivers,
  useOwnerProfile,
  useOwnerSettings,
  useOwnerWorkDataByLogId,
} from '../../store/ownerDataHooks.js'
import { toLinkedDriverLink } from './linkedDriverLink.js'
import '../../main-calendar.css'
import './linked-driver.css'

const YEAR_OPTIONS = getYearOptions()
const DETAIL_SOON = '상세설정은 구상중으로 빠르게 업데이트예정입니다.'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function LinkedDriverManagementPage({ ownerKey = 'guest', onBack, showToast }) {
  const navigate = useNavigate()
  const { linkId: rawLinkId } = useParams()
  const linkId = decodeURIComponent(rawLinkId || '')
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const workByLogId = useOwnerWorkDataByLogId(ownerKey)
  const [viewDate, setViewDate] = useState(() => new Date())

  const driver = drivers.find((item) => item.id === linkId) || null
  const link = driver ? toLinkedDriverLink(driver) : null
  const car = (cars || []).find((item) => item.number === link?.vehicleNumber) || null
  const settings = useMemo(() => {
    void clients
    void cars
    void practiceSettings
    void profile
    void drivers
    return buildFinanceSettings(ownerKey)
  }, [ownerKey, clients, cars, practiceSettings, profile, drivers])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const plate = String(link?.vehicleNumber || '').trim()
  const dayData = (plate && workByLogId?.[plate]) || {}

  /** @type {import('../../domain/financeTypes.js').CarLike} */
  const carOrEmpty = car || { number: '' }

  const detail = useMemo(() => {
    if (!link) return null
    return getLinkedDriverSettlementDetail(dayData, monthKey, link, carOrEmpty)
  }, [dayData, monthKey, link, carOrEmpty])

  const invoice = useMemo(() => {
    if (!detail) return { groups: [], unassignedCount: 0 }
    return getLinkedDriverClientInvoiceGroups(detail.trips, carOrEmpty, settings)
  }, [detail, carOrEmpty, settings])

  if (!driver || driver.status !== 'linked' || !link) {
    return (
      <div className="page">
        <div className="settings-header">
          <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="settings-title">기사 관리</div>
          <div style={{ width: 40 }}></div>
        </div>
        <div className="empty-state">연동 중인 기사 정보를 찾을 수 없습니다.</div>
      </div>
    )
  }

  const assignment = getAssignmentState(link)
  const driverName = link.driverName || '기사'
  const initial = String(driverName).slice(0, 1)

  return (
    <div className="page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">{driverName} 기사 관리</div>
        <div style={{ width: 40 }}></div>
      </div>

      <section className="linked-driver-profile-card">
        <div>
          <span className="linked-driver-avatar">{initial}</span>
          <span>
            <strong>{driverName}</strong>
            <small>{link.phone || '연락처 없음'}</small>
          </span>
        </div>
        <div>
          <span>{link.vehicleNumber || '차량 미지정'}</span>
          <em className={assignment.key}>{assignment.label}</em>
        </div>
      </section>

      <div className="linked-driver-chip-row">
        <button type="button" className="linked-driver-chip" onClick={() => navigate(`/app/drivers/${encodeURIComponent(linkId)}/clients`)}>거래처</button>
        <button type="button" className="linked-driver-chip" onClick={() => navigate(`/app/drivers/${encodeURIComponent(linkId)}/billing`)}>정산·계산서 설정</button>
        <button type="button" className="linked-driver-chip" onClick={() => showToast?.(DETAIL_SOON)}>상세 설정</button>
      </div>

      <section className="tax-invoice-summary" id="linkedDriverSettlementSummary">
        <div className="date-navigator" style={{ marginBottom: 12 }}>
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => setViewDate(shiftMonth(viewDate, -1))}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="date-select-group">
            <select className="date-select" value={year} onChange={(e) => setViewDate(setYearMonth(viewDate, Number(e.target.value), month))}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="date-select" value={month} onChange={(e) => setViewDate(setYearMonth(viewDate, year, Number(e.target.value)))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i + 1}월</option>)}
            </select>
          </div>
          <button type="button" className="arrow-btn" title="다음 달" onClick={() => setViewDate(shiftMonth(viewDate, 1))}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
        <div className="summary-title"><span>기사 정산</span><span>{detail?.tripCount || 0}건</span></div>
        <div className="summary-row"><span>총 운송료</span><span className="summary-value">{formatWon(detail?.totalFare || 0)}</span></div>
        <div className="summary-row"><span>수수료</span><span className="summary-value">-{formatWon(detail?.commissionAmount || 0)}</span></div>
        <div className="summary-row"><span>산재보험</span><span className="summary-value">-{formatWon(detail?.insuranceAmount || 0)}</span></div>
        <div className="summary-row total"><span>최종 정산액</span><span className="summary-value">{formatWon(detail?.finalAmount || 0)}</span></div>
      </section>

      <section className="driver-list-section" style={{ marginTop: 18 }}>
        <div className="driver-section-heading">
          <div>
            <h3>거래처 세금계산서</h3>
            <p>이 기사가 실제로 운송한 거래처별 매출입니다.</p>
          </div>
        </div>
        {!invoice.groups.length ? (
          <div className="linked-driver-empty">
            선택한 달에 거래처가 연결된 운송 기록이 없습니다.
            {invoice.unassignedCount ? ` (거래처 미지정 운행 ${invoice.unassignedCount}건)` : ''}
          </div>
        ) : (
          <>
            {invoice.unassignedCount > 0 && (
              <p className="linked-driver-readonly-notice">
                <span>거래처 미지정 운행 {invoice.unassignedCount}건은 계산서 대상에서 제외됐습니다.</span>
              </p>
            )}
            {invoice.groups.map((g) => {
              const supplierLabel = g.vehicleLabel || g.supplierBiz?.name || ''
              return (
                <article key={g.clientName} className="linked-driver-invoice-card">
                  <div className="linked-driver-client-head-row">
                    <strong>{g.clientName}</strong>
                    <span>{g.count}건{supplierLabel ? ` · ${supplierLabel}` : ''}</span>
                  </div>
                  <div className="linked-driver-invoice-money">
                    <span>공급가액 <b>{formatWon(g.supplyAmount)}</b></span>
                    <span>세액 <b>{formatWon(g.taxAmount)}</b></span>
                    <strong><small>합계</small>{formatWon(g.totalAmount)}</strong>
                  </div>
                  <div className="linked-driver-client-trip-list">
                    {g.trips.map((t, idx) => (
                      <div key={`${t.dateKey}-${idx}`} className="linked-driver-client-trip-row">
                        <span>
                          {t.dateKey.slice(5).replace('-', '/')} {t.loadLoc || '상차지'} → {t.unloadLoc || '하차지'}
                        </span>
                        <b>{formatWon(t.fare)}</b>
                      </div>
                    ))}
                  </div>
                </article>
              )
            })}
          </>
        )}
      </section>
    </div>
  )
}
