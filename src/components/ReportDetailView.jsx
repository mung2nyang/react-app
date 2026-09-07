// @ts-check
// 리포트 요약·세부·거래처 선택 모달을 한 파일에 응집(ReportPage는 조립만). 219줄 — §6 ~250 허용.
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
 * @param {Object} props
 * @param {string} props.title
 * @param {{ name?: string, phone?: string, bankName?: string, accountNumber?: string, accountHolder?: string }} props.profile
 * @param {{ number?: string, tonnage?: string }|null} props.car
 * @param {{ trips: number, callTrips?: number, unitPrice: number, fare: number, vat: number, total: number, maint: number, fuel: number, misc: number }} props.report
 * @param {(value: unknown) => string} props.dash
 * @param {(value: number|string) => string} props.formatWon
 */
export function ReportSummaryContent({ title, profile, car, report, dash, formatWon }) {
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
      <div className="summary-card">
        <div className="summary-title">
          <span>월간 운송료 정산</span>
          <span>횟수 {report.trips}회 · 세부 입력 {report.callTrips || 0}건</span>
        </div>
        <div className="summary-row">
          <span>1회 단가</span>
          <span className="summary-value">{formatWon(report.unitPrice)}</span>
        </div>
        <div className="summary-row">
          <span>기본 운송료</span>
          <span className="summary-value">{formatWon(report.fare)}</span>
        </div>
        <div className="summary-row">
          <span>부가세 (공급가액 기준 10%)</span>
          <span className="summary-value">{formatWon(report.vat)}</span>
        </div>
        <div className="summary-row total">
          <span>계</span>
          <span className="summary-value">{formatWon(report.total)}</span>
        </div>
        <div className="summary-row">
          <span>차량 정비비</span>
          <span className="summary-value">{formatWon(report.maint)}</span>
        </div>
        <div className="summary-row">
          <span>차량 주유비</span>
          <span className="summary-value">{formatWon(report.fuel)}</span>
        </div>
        <div className="summary-row">
          <span>통행료/기타</span>
          <span className="summary-value">{formatWon(report.misc)}</span>
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
