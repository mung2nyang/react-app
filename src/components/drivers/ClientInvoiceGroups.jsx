// @ts-check
import { formatWon } from '../../lib/money.js'

/**
 * @typedef {{ dateKey: string, loadLoc?: string, unloadLoc?: string, fare: number }} InvoiceTrip
 * @typedef {{
 *   clientName: string,
 *   count: number,
 *   supplyAmount: number,
 *   taxAmount: number,
 *   totalAmount: number,
 *   vehicleLabel?: string,
 *   supplierBiz?: { name?: string },
 *   trips: Array<InvoiceTrip>,
 * }} InvoiceGroup
 */

/**
 * @param {Object} props
 * @param {{ groups: Array<InvoiceGroup>, unassignedCount: number }} props.invoice
 */
export default function ClientInvoiceGroups({ invoice }) {
  return (
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
  )
}
