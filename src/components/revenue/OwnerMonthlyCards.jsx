// @ts-check
// 재감사 2차(FAIL 지적) — RevenuePage.jsx 분할 조각: 오너 월별 손익 카드 3장
// (순이익/수입/지출)과 그 안의 접이식 상세 행.
import { useState } from 'react'
import { dateLabel, won } from './revenueFormat.js'

/** @typedef {ReturnType<typeof import('../../domain/finance.js').getOwnerMonthlyFinanceDetail>} OwnerMonthlyDetail */
/** @typedef {{ label: string, amount: number, date?: string }} DetailLine */

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {number} props.amount
 * @param {Array<DetailLine>} props.items
 * @param {boolean} [props.showDate]
 */
function RevenueDetailRow({ label, amount, items, showDate = false }) {
  const [open, setOpen] = useState(false)
  const lines = Array.isArray(items) ? items : []

  return (
    <div className="revenue-detail-item">
      <button type="button" className={`revenue-detail-head${open ? ' expanded' : ''}`} onClick={() => setOpen((v) => !v)}>
        <span className="revenue-detail-chevron">
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </span>
        <span className="revenue-detail-label">{label}</span>
        <span className={`revenue-detail-amount${amount < 0 ? ' negative' : ''}`}>{won(amount)}</span>
      </button>
      {open && (
        <div className="revenue-detail-body">
          {lines.length === 0 && <div className="revenue-detail-empty">내역이 없습니다.</div>}
          {lines.map((item, index) => (
            <div key={`${item.label}-${item.date || index}`} className="revenue-detail-line">
              <span>{showDate ? dateLabel(item.date) : ''}{item.label}</span>
              <span>{won(item.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** @param {{ detail: OwnerMonthlyDetail, scope?: string }} props */
export default function OwnerMonthlyCards({ detail, scope }) {
  return (
    <>
      <div className="summary-card revenue-net-card">
        <div className="summary-row" style={{ marginBottom: 2 }}>
          <span className="summary-title" style={{ marginBottom: 0 }}>당월 순이익</span>
          <span
            className="summary-value"
            style={{
              fontSize: 'var(--fs-7)',
              fontWeight: 850,
              color: detail.netProfit < 0 ? 'var(--sunday-color)' : 'var(--primary-color)',
            }}
          >
            {won(detail.netProfit)}
          </span>
        </div>
        <div className="revenue-net-stats">총 {detail.tripCount}회 운행 / {detail.distanceKm.toLocaleString('ko-KR')}km / {detail.durationHours.toLocaleString('ko-KR')}시간</div>
        <div className="summary-row" style={{ marginTop: 14 }}>
          <span>당월 부가세(공급가액 기준 10%)</span>
          <span className="summary-value">{won(detail.vatAmount)}</span>
        </div>
        <RevenueDetailRow
          label={`미입금 운송료(${detail.unpaid.count}건)`}
          amount={detail.unpaid.total}
          items={detail.unpaid.items.map((item) => ({ label: item.client, amount: item.remainingAmount }))}
        />
      </div>

      <div className="summary-card revenue-net-card">
        <div className="summary-title">운송 수입</div>
        <RevenueDetailRow label="운송료" amount={detail.income.fare.total} items={detail.income.fare.items} />
        <RevenueDetailRow
          label="운임 수수료"
          amount={-detail.income.commission.total}
          items={detail.income.commission.items.map((item) => ({ label: item.label, amount: -item.amount }))}
        />
        <RevenueDetailRow
          label="당월 유가보조금 환급"
          amount={detail.income.fuelSubsidy.total}
          items={detail.income.fuelSubsidy.items}
          showDate
        />
        <div className="summary-row total">
          <span>합계</span>
          <span className="summary-value">{(Number(detail.income.total) || 0).toLocaleString('ko-KR')} 원</span>
        </div>
      </div>

      <div className="summary-card revenue-net-card">
        <div className="summary-title">운행 지출</div>
        <RevenueDetailRow
          label="정비"
          amount={-detail.expense.maint.total}
          items={detail.expense.maint.items.map((item) => ({ ...item, amount: -item.amount }))}
          showDate
        />
        <RevenueDetailRow
          label="주유비"
          amount={-detail.expense.fuel.total}
          items={detail.expense.fuel.items.map((item) => ({ ...item, amount: -item.amount }))}
          showDate
        />
        <RevenueDetailRow
          label="기타"
          amount={-detail.expense.misc.total}
          items={detail.expense.misc.items.map((item) => ({ ...item, amount: -item.amount }))}
          showDate
        />
        {scope !== 'owner' && (
          <RevenueDetailRow
            label="기사 급여"
            amount={-detail.expense.salary.total}
            items={detail.expense.salary.items.map((item) => ({ ...item, amount: -item.amount }))}
          />
        )}
        <div className="summary-row total revenue-expense-total">
          <span>합계</span>
          <span className="summary-value">-{(Number(detail.expense.total) || 0).toLocaleString('ko-KR')} 원</span>
        </div>
      </div>
    </>
  )
}
