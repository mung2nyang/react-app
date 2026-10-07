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
 * @param {{ groups: Array<InvoiceGroup>, unassignedCount: number, unassignedTrips: Array<InvoiceTrip> }} props.invoice
 */
export default function ClientInvoiceGroups({ invoice }) {
  const unassigned = invoice.unassignedTrips
  const unassignedTotal = unassigned.reduce((sum, t) => sum + (Number(t.fare) || 0), 0)
  // 거래처별 카드는 바깥 묶음 카드 없이 화면에 바로 놓는다(빈 달 안내만 카드 하나).
  return (
    <>
      {!invoice.groups.length ? !unassigned.length && (
        <section className="driver-list-section">
          <div className="linked-driver-empty">
            선택한 달에 거래처가 연결된 운송 기록이 없습니다.
          </div>
        </section>
      ) : (
        <>
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
                <TripList trips={g.trips} />
              </article>
            )
          })}
        </>
      )}
      {unassigned.length > 0 && (
        <article className="linked-driver-invoice-card">
          <div className="linked-driver-client-head-row">
            <strong>거래처 미지정</strong>
            <span>{unassigned.length}건</span>
          </div>
          <div className="linked-driver-invoice-money">
            <span>거래처를 지정하면 계산서 대상에 포함됩니다.</span>
            <strong><small>운송료 합계</small>{formatWon(unassignedTotal)}</strong>
          </div>
          <TripList trips={unassigned} />
        </article>
      )}
    </>
  )
}

/** 운행 줄 목록: 날짜 상차지 → 하차지 · 운송료 */
function TripList(/** @type {{ trips: Array<InvoiceTrip> }} */ { trips }) {
  return (
    <div className="linked-driver-client-trip-list">
      {trips.map((t, idx) => (
        <div key={`${t.dateKey}-${idx}`} className="linked-driver-client-trip-row">
          <span>
            {t.dateKey.slice(5).replace('-', '/')} {t.loadLoc || '상차지'} → {t.unloadLoc || '하차지'}
          </span>
          <b>{formatWon(t.fare)}</b>
        </div>
      ))}
    </div>
  )
}
