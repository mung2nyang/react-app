// @ts-check
// 기사 관리 화면(조회 전용). 연동(linkId)·미연동 서브(logId) 두 모드.
// 모드 판별은 domain/driverManagementContext.js — AGENTS §6 응집도 ≤250.
// 정산 요약·거래처 세금계산서 JSX는 SettlementSummaryCard·ClientInvoiceGroups로 분리.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { resolveDriverManagementContext } from '../../domain/driverManagementContext.js'
import { getShortCarNum } from '../../domain/cars.js'
import { getAssignmentState } from '../../domain/drivers.js'
import {
  getLinkedDriverClientInvoiceGroups,
  getLinkedDriverSettlementDetail,
} from '../../domain/finance.js'
import { setYearMonth, shiftMonth } from '../../lib/calendar.js'
import { buildFinanceSettings } from '../../lib/ownerFinance.js'
import {
  useOwnerCars,
  useOwnerClients,
  useOwnerDrivers,
  useOwnerProfile,
  useOwnerSettings,
  useOwnerWorkDataByLogId,
} from '../../store/ownerDataHooks.js'
import ClientInvoiceGroups from './ClientInvoiceGroups.jsx'
import SettlementSummaryCard from './SettlementSummaryCard.jsx'
import { toLinkedDriverLink } from './linkedDriverLink.js'
import './linked-driver.css'

const SOON = '준비 중입니다.'
/**
 * @param {(() => void)|undefined} onBack
 * @param {string} t
 * @param {(() => void)|undefined} [onOpenMenu]
 */
function pageHeader(onBack, t, onOpenMenu) {
  return (
    <div className="settings-header">
      <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
      <div className="settings-title">{t}</div>
      {onOpenMenu ? (
        <button type="button" className="icon-btn top-menu-btn" title="메뉴" onClick={onOpenMenu}>
          <svg viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      ) : <div style={{ width: 40 }}></div>}
    </div>
  )
}

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function LinkedDriverManagementPage({ ownerKey = 'guest', onBack, showToast, onOpenMenu }) {
  const navigate = useNavigate()
  const { linkId: rawLinkId, logId: rawLogId } = useParams()
  const linkId = decodeURIComponent(rawLinkId || '')
  const logId = decodeURIComponent(rawLogId || '')
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const workByLogId = useOwnerWorkDataByLogId(ownerKey)
  const [viewDate, setViewDate] = useState(() => new Date())

  const ctx = useMemo(
    () => resolveDriverManagementContext({ linkId, logId }, drivers, cars),
    [linkId, logId, drivers, cars],
  )
  const link = ctx.driver ? toLinkedDriverLink(ctx.driver) : null
  const plate = ctx.plate
  const unlinked = ctx.mode === 'unlinked'

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
  const dayData = (plate && workByLogId?.[plate]) || {}

  /** @type {import('../../domain/financeTypes.js').CarLike} */
  const carOrEmpty = ctx.car || { number: '' }

  const detail = useMemo(() => {
    if (ctx.notFound) return null
    if (ctx.mode === 'linked') {
      if (!link) return null
      return getLinkedDriverSettlementDetail(dayData, monthKey, link, carOrEmpty)
    }
    if (ctx.mode === 'unlinked' && ctx.car) {
      // 미연동은 할당기간 없음 — assignmentStart 빈 값은 isDateWithinAssignment가 전부 포함(link=null과 동일).
      const openLink = /** @type {import('../../domain/financeTypes.js').DriverLinkLike} */ ({
        id: '',
        vehicleNumber: plate,
        assignmentStart: '',
        assignmentEnd: '',
      })
      return getLinkedDriverSettlementDetail(dayData, monthKey, openLink, carOrEmpty)
    }
    return null
  }, [ctx.notFound, ctx.mode, ctx.car, dayData, monthKey, link, carOrEmpty, plate])

  const invoice = useMemo(() => {
    if (!detail) return { groups: [], unassignedCount: 0 }
    return getLinkedDriverClientInvoiceGroups(detail.trips, carOrEmpty, settings)
  }, [detail, carOrEmpty, settings])

  const title = unlinked
    ? `${ctx.car?.driverName || getShortCarNum(plate) || '차량'} 기사 관리`
    : ((link?.driverName || '기사') + ' 기사 관리')

  if (ctx.notFound) {
    return (
      <div className="page">
        {pageHeader(onBack, unlinked ? title : '기사 관리', onOpenMenu)}
        <div className="empty-state">
          {unlinked ? '차량 정보를 찾을 수 없습니다.' : '연동 중인 기사 정보를 찾을 수 없습니다.'}
        </div>
      </div>
    )
  }

  const assignment = link ? getAssignmentState(link) : null
  const driverName = link?.driverName || '기사'
  const nameLine = unlinked ? plate : `${driverName} · ${plate || '차량 미지정'}`
  const initial = String(unlinked ? plate : driverName).slice(0, 1)

  return (
    <div className="page">
      {pageHeader(onBack, title, onOpenMenu)}
      <section className="linked-driver-profile-card">
        <div>
          <span className="linked-driver-avatar">{initial}</span>
          <span>
            <strong>{nameLine}</strong>
            {!unlinked && <small>{link?.phone || '연락처 없음'}</small>}
          </span>
        </div>
        <div>
          {unlinked ? (
            <button
              type="button"
              className="linked-driver-chip"
              onClick={() => navigate(`/app/logs/${encodeURIComponent(plate)}`)}
            >
              운행일지
            </button>
          ) : (
            <>
              <span>{plate || '차량 미지정'}</span>
              {assignment && <em className={assignment.key}>{assignment.label}</em>}
            </>
          )}
        </div>
      </section>

      <div className="linked-driver-chip-row">
        <button
          type="button"
          className="linked-driver-chip"
          onClick={() => {
            if (unlinked) navigate(`/app/logs/${encodeURIComponent(plate)}/clients`)
            else navigate(`/app/drivers/${encodeURIComponent(linkId)}/clients`)
          }}
        >
          거래처
        </button>
        <button type="button" className="linked-driver-chip" onClick={() => showToast?.(SOON)}>운송내역서</button>
        <button type="button" className="linked-driver-chip" onClick={() => navigate(`/app/logs/${encodeURIComponent(plate)}/expenses`)}>정비/주유/기타</button>
      </div>

      <SettlementSummaryCard
        viewDate={viewDate}
        onPrevMonth={() => setViewDate(shiftMonth(viewDate, -1))}
        onNextMonth={() => setViewDate(shiftMonth(viewDate, 1))}
        onYearChange={(y) => setViewDate(setYearMonth(viewDate, y, month))}
        onMonthChange={(m) => setViewDate(setYearMonth(viewDate, year, m))}
        detail={detail}
      />
      <ClientInvoiceGroups invoice={invoice} />
    </div>
  )
}
