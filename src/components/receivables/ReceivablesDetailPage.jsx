// @ts-check
import { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { formatWon } from '../../lib/money.js'
import { formatWorkMonth, groupItems, receivableItemKey } from '../../lib/receivables.js'
import { parseClientParam, parseMonthParam } from './receivablesPaths.js'
import { useReceivablesData } from './useReceivablesData.js'
import { useReceivablesActions } from './useReceivablesActions.js'
import { useConfirm } from './useConfirm.jsx'
import ReceivableItemCard from './ReceivableItemCard.jsx'

/** @typedef {import('../../domain/financeReceivables.js').ReceivableItemLike} ReceivableItemLike */

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onWorkChanged]
 */
export default function ReceivablesDetailPage({ ownerKey = 'guest', showToast, onWorkChanged }) {
  const navigate = useNavigate()
  const { client: clientParam, month: monthParam } = useParams()
  const monthKey = parseMonthParam(monthParam)
  const clientName = parseClientParam(clientParam)
  const { confirm, confirmDialog } = useConfirm()
  const { workDataByLogId, settings, items, hasSubCars } = useReceivablesData(ownerKey)
  const actions = useReceivablesActions({
    ownerKey, workDataByLogId, settings, showToast, onWorkChanged, confirm,
  })

  const detailItems = useMemo(() => (
    monthKey && clientName ? groupItems(items, clientName, monthKey) : []
  ), [items, clientName, monthKey])
  const detailTotal = detailItems.reduce((/** @type {number} */ sum, /** @type {ReceivableItemLike} */ item) => sum + item.remainingAmount, 0)
  const dueDates = detailItems.map((/** @type {ReceivableItemLike} */ item) => item.paymentDueDate).filter(Boolean).sort()

  if (!monthKey || !clientName) {
    return <Navigate to="/app/receivables" replace />
  }

  /** @param {string} key */
  function togglePartial(key) {
    actions.setPartialKey(actions.partialKey === key ? '' : key)
    actions.setPartialAmount('')
  }

  return (
    <div className="page receivables-page">
      {confirmDialog}
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={() => navigate('/app/receivables')}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">미수금 상세</div>
        <div style={{ width: 40 }}></div>
      </div>

      <section className="receivable-detail-summary">
        <div className="receivable-detail-eyebrow">{formatWorkMonth(monthKey)}</div>
        <h2>{clientName}</h2>
        <div className="receivable-detail-total">
          <span>총 미수금</span>
          <strong>{formatWon(detailTotal)}</strong>
        </div>
        <div className="car-sub-text">{detailItems.length}건 · {dueDates.length ? `입금 예정일 ${dueDates[0].replace(/-/g, '.')}` : '입금 예정일 미등록'}</div>
      </section>

      {detailItems.length === 0 && <div className="empty-state">모든 미수금이 입금 완료 처리되었습니다.</div>}
      {detailItems.map((/** @type {ReceivableItemLike} */ item) => (
        <ReceivableItemCard
          key={receivableItemKey(item)}
          item={item}
          compact={false}
          hasSubCars={hasSubCars}
          saving={actions.saving}
          partialKey={actions.partialKey}
          partialAmount={actions.partialAmount}
          historyKey={actions.historyKey}
          onTogglePartial={togglePartial}
          onPartialAmountChange={actions.setPartialAmount}
          onConfirmPartial={() => actions.confirmPartial(item)}
          onToggleHistory={(key) => actions.setHistoryKey(actions.historyKey === key ? '' : key)}
          onPayItem={() => actions.payItem(item)}
          onUndoPayment={() => actions.undoPayment(item)}
        />
      ))}

      {detailItems.length > 0 && (
        <button
          type="button"
          className="personal-account-btn"
          onClick={async () => {
            const leave = await actions.payGroup(clientName, monthKey, true)
            if (leave) navigate('/app/receivables')
          }}
          disabled={actions.saving}
        >
          전체 입금 완료 처리
        </button>
      )}
    </div>
  )
}
