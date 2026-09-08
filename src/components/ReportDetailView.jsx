// @ts-check
// 리포트 요약·세부·거래처 선택 모달을 한 파일에 응집(ReportPage는 조립만).
// §6: 요약 일자표·세부표·모달이 같은 리포트 화면 조각이라 분리하면 항상 같이 읽음(~330줄 허용).
import { formatWon } from '../lib/money.js'

/**
 * @typedef {Object} DetailReportItem
 * @property {string} dateStr
 * @property {string} loadLoc
 * @property {string} unloadLoc
 * @property {string} client
 * @property {number} fare
 */

/**
 * @typedef {Object} DetailReport
 * @property {Array<DetailReportItem>} items
 * @property {number} defaultBaseFare
 * @property {Record<string, number>} monthFareByClient
 * @property {Record<string, number>} monthCommByClient
 * @property {Record<string, string>} clientCommLabels
 * @property {number} vat
 * @property {number} grandTotal
 */

/**
 * @typedef {Object} ReportDayRow
 * @property {number} day
 * @property {boolean} isOff
 * @property {number} workVal
 * @property {number} palletCount
 * @property {number} amount
 */

/**
 * @param {Object} props
 * @param {Array<ReportDayRow>} props.days
 * @param {number} props.monthIndex
 * @param {boolean} props.showPallet
 */
function ReportDayTable({ days, monthIndex, showPallet }) {
  const monthLabel = monthIndex + 1
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th style={{ width: showPallet ? '30%' : '35%' }}>날짜</th>
          <th style={{ width: showPallet ? '20%' : '25%' }}>운행</th>
          {showPallet && <th style={{ width: '20%' }}>파렛트</th>}
          <th style={{ width: showPallet ? '30%' : '40%' }}>금액</th>
        </tr>
      </thead>
      <tbody>
        {days.map((item) => (
          <tr key={item.day}>
            <td>{monthLabel}월 {item.day}일</td>
            <td>{item.isOff ? '휴무' : `${item.workVal}회`}</td>
            {showPallet && <td>{item.palletCount > 0 ? `${item.palletCount}장` : '-'}</td>}
            <td className="amount">{item.amount.toLocaleString('ko-KR')}원</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * @param {Array<ReportDayRow>} days
 * @param {number} monthIndex
 * @param {boolean} showPallet
 * @param {boolean} isExporting
 */
function renderSummaryDayTables(days, monthIndex, showPallet, isExporting) {
  if (!days.length) {
    return (
      <table className="report-table">
        <tbody>
          <tr>
            <td style={{ textAlign: 'center', padding: 15, color: 'var(--sub-text-color)' }}>
              해당 월의 운송 내역이 없습니다.
            </td>
          </tr>
        </tbody>
      </table>
    )
  }
  if (isExporting) {
    const half = Math.ceil(days.length / 2)
    const left = days.slice(0, half)
    const right = days.slice(half)
    return (
      <div className="report-split-container">
        <div className="report-split-column">
          <ReportDayTable days={left} monthIndex={monthIndex} showPallet={showPallet} />
        </div>
        <div className="report-split-column">
          {right.length > 0
            ? <ReportDayTable days={right} monthIndex={monthIndex} showPallet={showPallet} />
            : null}
        </div>
      </div>
    )
  }
  return <ReportDayTable days={days} monthIndex={monthIndex} showPallet={showPallet} />
}

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {{ name?: string, phone?: string, bankName?: string, accountNumber?: string, accountHolder?: string }} props.profile
 * @param {{ number?: string, tonnage?: string }|null} props.car
 * @param {{
 *   monthIndex: number,
 *   days: Array<ReportDayRow>,
 *   showPallet: boolean,
 *   distanceKm: number,
 *   fixedBaseFare: number,
 *   defaultBaseFare: number,
 *   fareByClient: Record<string, number>,
 *   commissionByClient: Record<string, number>,
 *   commissionLabelByClient: Record<string, string>,
 *   vat: number,
 *   total: number,
 * }} props.report
 * @param {(value: unknown) => string} props.dash
 * @param {(value: number|string) => string} props.formatWon
 * @param {boolean} [props.isExporting]
 */
export function ReportSummaryContent({ title, profile, car, report, dash, formatWon, isExporting = false }) {
  const clientNames = Object.keys(report.fareByClient || {})
  const baseFare = (Number(report.fixedBaseFare) || 0) + (Number(report.defaultBaseFare) || 0)
  const showBaseFare = baseFare > 0 || clientNames.length === 0
  const days = Array.isArray(report.days) ? report.days : []
  const showPallet = !!report.showPallet

  return (
    <>
      <div className="report-title">{title}</div>
      <table className="info-table">
        <tbody>
          <tr>
            <th>성명</th>
            <td>{dash(profile.name)}</td>
            <th>연락처</th>
            <td>{dash(profile.phone)}</td>
          </tr>
          <tr>
            <th>차량번호</th>
            <td>{dash(car?.number)}</td>
            <th>차량톤수</th>
            <td>{dash(car?.tonnage)}</td>
          </tr>
          <tr>
            <th>입금은행</th>
            <td>{dash(profile.bankName)}</td>
            <th>계좌번호</th>
            <td>{dash(profile.accountNumber)}</td>
          </tr>
          <tr>
            <th>예금주</th>
            <td colSpan={3}>{dash(profile.accountHolder)}</td>
          </tr>
        </tbody>
      </table>
      {renderSummaryDayTables(days, report.monthIndex, showPallet, isExporting)}
      <div className="summary-card">
        <div
          className="summary-row"
          style={{
            color: 'var(--primary-color)',
            fontWeight: 700,
            borderBottom: '1px dashed var(--border-color)',
            paddingBottom: 10,
            marginBottom: 10,
          }}
        >
          <span>월간 총 운행거리</span>
          <span className="summary-value">{report.distanceKm} km</span>
        </div>
        {showBaseFare && (
          <div className="summary-row">
            <span>기본 운송료</span>
            <span className="summary-value">{formatWon(baseFare)}</span>
          </div>
        )}
        {clientNames.map((client) => (
          <div key={client}>
            <div className="summary-row">
              <span>{client} 기본 운송료</span>
              <span className="summary-value">{formatWon(report.fareByClient[client])}</span>
            </div>
            {(report.commissionByClient[client] || 0) > 0 && (
              <div className="summary-row summary-client-commission-row">
                <span className="summary-client-commission-label">
                  {client} 수수료 ({report.commissionLabelByClient[client]})
                </span>
                <span className="summary-value">- {formatWon(report.commissionByClient[client])}</span>
              </div>
            )}
          </div>
        ))}
        <div className="summary-row">
          <span>부가세 (공급가액 기준 10%)</span>
          <span className="summary-value">{formatWon(report.vat)}</span>
        </div>
        <div className="summary-row total">
          <span>계</span>
          <span className="summary-value">{formatWon(report.total)}</span>
        </div>
      </div>
    </>
  )
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Array<string>} props.options
 * @param {string} props.value
 * @param {(next: string) => void} props.onChange
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onClose
 */
export function ReportClientPickerModal({ open, options, value, onChange, onConfirm, onClose }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">세부 내역서 조회</div>
        <div className="form-group">
          <label htmlFor="detailReportClientSelect">거래처</label>
          <select
            id="detailReportClientSelect"
            className="input-box"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option === 'ALL' ? '전체 (모두)' : option}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onConfirm}>조회</button>
        </div>
      </div>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {DetailReport} props.report
 * @param {string} props.clientFilter
 * @param {boolean} props.showClientColumn
 * @param {string} props.title
 */
export default function ReportDetailContent({ report, clientFilter, showClientColumn, title }) {
  const clientKeys = Object.keys(report.monthFareByClient)
  const showDefaultBase = report.defaultBaseFare > 0 || clientKeys.length === 0

  return (
    <>
      <div className="report-title">{title}</div>
      <table className="report-table detail-report-table">
        <thead>
          <tr>
            <th className="detail-date-cell">날짜</th>
            <th className="detail-text-cell detail-location-cell">상차지</th>
            <th className="detail-text-cell detail-location-cell">하차지</th>
            {showClientColumn && <th className="detail-text-cell">거래처</th>}
            <th className="detail-amount-cell">금액</th>
          </tr>
        </thead>
        <tbody>
          {report.items.length > 0 ? report.items.map((item, index) => (
            <tr key={`${item.dateStr}-${item.client}-${index}`}>
              <td className="detail-date-cell">{item.dateStr}</td>
              <td className="detail-text-cell detail-location-cell">{item.loadLoc}</td>
              <td className="detail-text-cell detail-location-cell">{item.unloadLoc}</td>
              {showClientColumn && <td className="detail-text-cell">{item.client}</td>}
              <td className="amount detail-amount-cell">{item.fare.toLocaleString('ko-KR')}원</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={showClientColumn ? 5 : 4} style={{ textAlign: 'center', padding: 15 }}>
                해당 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="summary-card">
        <div className="summary-title">
          <span>세부 운송료 정산</span>
          <span>{clientFilter === 'ALL' ? '전체' : clientFilter}</span>
        </div>
        {showDefaultBase && (
          <div className="summary-row">
            <span>기본 운송료</span>
            <span className="summary-value">{formatWon(report.defaultBaseFare)}</span>
          </div>
        )}
        {clientKeys.map((client) => (
          <div key={client}>
            <div className="summary-row">
              <span>{client} 기본 운송료</span>
              <span className="summary-value">{formatWon(report.monthFareByClient[client])}</span>
            </div>
            {(report.monthCommByClient[client] || 0) > 0 && (
              <div className="summary-row summary-row-indent">
                <span>└ {client} 수수료 ({report.clientCommLabels[client]})</span>
                <span className="summary-value">- {formatWon(report.monthCommByClient[client])}</span>
              </div>
            )}
          </div>
        ))}
        <div className="summary-row">
          <span>부가세 (공급가액 기준 10%)</span>
          <span className="summary-value">{formatWon(report.vat)}</span>
        </div>
        <div className="summary-row total">
          <span>계</span>
          <span className="summary-value">{formatWon(report.grandTotal)}</span>
        </div>
      </div>
    </>
  )
}
