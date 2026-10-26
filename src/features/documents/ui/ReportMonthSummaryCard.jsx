// @ts-check
// 운송비 내역서 요약의 "월간 운송료 정산" 카드 — 거래처별 운송료·파렛트·산재·부가세·계.

/**
 * @param {Object} props
 * @param {{
 *   distanceKm: number,
 *   trips?: number,
 *   callTrips?: number,
 *   fixedBaseFare: number,
 *   defaultBaseFare: number,
 *   fareByClient: Record<string, number>,
 *   commissionByClient: Record<string, number>,
 *   commissionLabelByClient: Record<string, string>,
 *   palletFare?: number,
 *   vat: number,
 *   insuranceTotal?: number,
 *   total: number,
 * }} props.report
 * @param {(value: number|string) => string} props.formatWon
 * @param {boolean} [props.distanceOn]
 */
export function ReportMonthSummaryCard({ report, formatWon, distanceOn = false }) {
  const clientNames = Object.keys(report.fareByClient || {})
  const baseFare = (Number(report.fixedBaseFare) || 0) + (Number(report.defaultBaseFare) || 0)
  const showBaseFare = baseFare > 0 || clientNames.length === 0
  const tripCount = (Number(report.trips) || 0) + (Number(report.callTrips) || 0)
  const showDistance = distanceOn && report.distanceKm > 0

  return (
    <div className="summary-card">
      <div className="summary-title">
        <span>월간 운송료 정산</span>
        <span>총 {tripCount}회 운행</span>
      </div>
      {showDistance && (
        <div className="summary-row">
          <span>월간 총 운행거리</span>
          <span className="summary-value">{report.distanceKm} km</span>
        </div>
      )}
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
      {(report.palletFare || 0) > 0 && (
        <div className="summary-row">
          <span>파렛트 회수 청구액</span>
          <span className="summary-value">{formatWon(report.palletFare || 0)}</span>
        </div>
      )}
      {(report.insuranceTotal || 0) > 0 && (
        <div className="summary-row">
          <span>산재보험료</span>
          <span className="summary-value">- {formatWon(report.insuranceTotal || 0)}</span>
        </div>
      )}
      <div className="summary-row">
        <span>부가세 (공급가액 기준 10%)</span>
        <span className="summary-value">{formatWon(report.vat)}</span>
      </div>
      <div className="summary-row total">
        <span>계</span>
        <span className="summary-value">{formatWon(report.total)}</span>
      </div>
    </div>
  )
}
