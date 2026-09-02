// @ts-check
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatWon } from '../../lib/money.js'
import { formatWorkMonth, receivableItemKey } from '../../lib/receivables.js'
import { receivablesDetailPath } from './receivablesPaths.js'
import { useReceivablesData } from './useReceivablesData.js'
import { useReceivablesActions } from './useReceivablesActions.js'
import { useConfirm } from './useConfirm.js'
import ReceivableItemCard from './ReceivableItemCard.jsx'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onWorkChanged]
 */
export default function ReceivablesListPage({ ownerKey = 'guest', onBack, showToast, onWorkChanged }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('monthly')
  const [historyKey, setHistoryKey] = useState('')
  const { confirm, confirmDialog } = useConfirm()
  const { workDataByLogId, settings, groups, dueItems, hasSubCars } = useReceivablesData(ownerKey)
  const actions = useReceivablesActions({
    ownerKey, workDataByLogId, settings, showToast, onWorkChanged, confirm,
  })

  return (
    <div className="page receivables-page">
      {confirmDialog}
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">미수금/정산 관리</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="settings-segmented-control maint-fuel-tabs">
        <button type="button" className={`toggle-btn${tab === 'monthly' ? ' active-work' : ''}`} onClick={() => setTab('monthly')}>월별 묶음 정산</button>
        <button type="button" className={`toggle-btn${tab === 'due' ? ' active-work' : ''}`} onClick={() => setTab('due')}>입금 예정 미수금</button>
      </div>
      <p className="car-type-hint">운행 일지 세부 입력에서 자동으로 모읍니다. 부분 입금은 상세에서 기록합니다.</p>

      {tab === 'monthly' && (
        <>
          {groups.length === 0 && <div className="empty-state">미수금 내역이 없습니다.</div>}
          {groups.map((group) => (
            <div key={`${group.client}-${group.monthKey}`} className="management-list-card receivable-group-card">
              <div className="management-card-copy">
                <div className="client-card-title"><strong>{group.client}</strong></div>
                <div className="car-sub-text">{formatWorkMonth(group.monthKey)}</div>
                {hasSubCars && (
                  <div className="car-sub-text">{[...new Map(group.items.map((item) => [item.logId, item.logLabel])).values()].join(' · ')}</div>
                )}
                <div className="receivable-group-summary">
                  <span>미수금</span>
                  <strong>{formatWon(group.total)}</strong>
                  <span>· {group.count}건</span>
                </div>
              </div>
              <div className="receivable-card-actions">
                <button type="button" className="action-icon-btn" onClick={() => navigate(receivablesDetailPath(group.client, group.monthKey))}>상세</button>
                <button type="button" className="action-icon-btn" onClick={() => actions.payGroup(group.client, group.monthKey, false)} disabled={actions.saving}>입금 완료</button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'due' && (
        <>
          {dueItems.length === 0 && <div className="empty-state">D-3 이내 또는 연체된 미수금이 없습니다.</div>}
          {dueItems.map((item) => (
            <ReceivableItemCard
              key={receivableItemKey(item)}
              item={item}
              compact
              hasSubCars={hasSubCars}
              historyKey={historyKey}
              onToggleHistory={(key) => setHistoryKey(historyKey === key ? '' : key)}
            />
          ))}
        </>
      )}
    </div>
  )
}
