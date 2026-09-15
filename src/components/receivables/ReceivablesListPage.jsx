// @ts-check
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatWon } from '../../lib/money.js'
import { formatWorkMonth, receivableItemKey } from '../../lib/receivables.js'
import { receivablesDetailPath } from './receivablesPaths.js'
import { useReceivablesData } from './useReceivablesData.js'
import { useReceivablesActions } from './useReceivablesActions.js'
import { useConfirm } from './useConfirm.jsx'
import ReceivableItemCard from './ReceivableItemCard.jsx'
import PageHeader from '../PageHeader.jsx'
import './receivables.css'

/** @typedef {import('../../domain/financeReceivables.js').ReceivableItemLike} ReceivableItemLike */

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onWorkChanged]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function ReceivablesListPage({ ownerKey = 'guest', onBack, showToast, onWorkChanged, onOpenMenu }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('monthly')
  const { workDataByLogId, settings, groups, dueItems, hasSubCars } = useReceivablesData(ownerKey)
  const { confirm, confirmDialog } = useConfirm()
  const actions = useReceivablesActions({
    ownerKey, workDataByLogId, settings, showToast, onWorkChanged, confirm,
  })

  return (
    <div className="page receivables-page">
      {confirmDialog}
      <PageHeader title="미수금/정산 관리" onBack={onBack} onOpenMenu={onOpenMenu} />

      <div className="receivable-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'monthly'}
          className={`receivable-tab${tab === 'monthly' ? ' active' : ''}`}
          onClick={() => setTab('monthly')}
        >
          월별 묶음 정산
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'due'}
          className={`receivable-tab${tab === 'due' ? ' active' : ''}`}
          onClick={() => setTab('due')}
        >
          입금 예정 미수금
        </button>
      </div>

      {tab === 'monthly' && (
        <>
          {groups.length === 0 && <div className="empty-state">미수금 내역이 없습니다.</div>}
          {groups.map((group) => {
            const carEntries = [...new Map(
              group.items.map((/** @type {ReceivableItemLike} */ item) => [item.logId, item.logLabel]),
            ).entries()]
            return (
              <div key={`${group.client}-${group.monthKey}`} className="receivable-group-card">
                <div className="receivable-group-head">
                  <div className="receivable-group-title">{group.client}</div>
                  <div className="receivable-group-period">{formatWorkMonth(group.monthKey)}</div>
                </div>
                {hasSubCars && carEntries.length > 0 && (
                  <div className="receivable-group-cars">
                    {carEntries.map(([logId, logLabel]) => (
                      <span
                        key={String(logId)}
                        className={`management-badge car-type${logId === 'main' ? ' main' : ''}`}
                      >
                        {logLabel}
                      </span>
                    ))}
                  </div>
                )}
                <div className="receivable-group-summary">
                  <span className="receivable-summary-label">미수금</span>
                  <strong className="receivable-summary-amount">{formatWon(group.total)}</strong>
                  <span className="receivable-summary-separator" aria-hidden="true">·</span>
                  <span className="receivable-summary-count">{group.count}건</span>
                </div>
                <div className="receivable-card-actions">
                  <button
                    type="button"
                    className="receivable-detail-btn"
                    onClick={() => navigate(receivablesDetailPath(group.client, group.monthKey))}
                  >
                    미수금 상세
                  </button>
                  <button
                    type="button"
                    className="receivable-complete-btn"
                    onClick={() => actions.payGroup(group.client, group.monthKey, false)}
                    disabled={actions.saving}
                  >
                    입금완료
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )}

      {tab === 'due' && (
        <>
          {dueItems.length === 0 && <div className="empty-state">D-3 이내 또는 연체된 미수금이 없습니다.</div>}
          {dueItems.map((/** @type {ReceivableItemLike} */ item) => (
            <ReceivableItemCard
              key={receivableItemKey(item)}
              item={item}
              compact
              hasSubCars={hasSubCars}
            />
          ))}
        </>
      )}
    </div>
  )
}
