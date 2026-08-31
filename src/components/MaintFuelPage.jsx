import { useMemo, useState } from 'react'
import ExpenseFormModal from './ExpenseFormModal.jsx'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import {
  emptyExpenseDraft,
  expenseTitle,
  filterMonth,
  groupExpensesByDate,
  KINDS,
  monthTotal,
  removeExpense,
  saveExpenses,
  upsertExpense,
} from '../lib/expenses.js'
import { formatWon } from '../lib/money.js'
import { readOwnerExpenses, useOwnerExpenses } from '../store/ownerDataHooks.js'

const YEAR_OPTIONS = getYearOptions()

export default function MaintFuelPage({ ownerKey = 'guest', onBack, showToast }) {
  const items = useOwnerExpenses(ownerKey)
  const [kind, setKind] = useState('maint')
  const [viewDate, setViewDate] = useState(() => new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(() => emptyExpenseDraft('maint'))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const list = useMemo(() => filterMonth(items, kind, year, month), [items, kind, year, month])
  const groups = useMemo(() => groupExpensesByDate(list), [list])
  const total = monthTotal(items, kind, year, month)
  const kindLabel = KINDS.find((item) => item.value === kind)?.label || '정비'

  function persist(next) {
    try {
      saveExpenses(ownerKey, next)
      return true
    } catch (error) {
      console.error('비용 저장 실패:', error)
      showToast?.('저장하지 못했습니다. 저장 공간을 확인해 주세요.')
      return false
    }
  }

  function openAdd() {
    setEditingId(null)
    setDraft(emptyExpenseDraft(kind))
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setDraft({
      kind: item.kind,
      date: item.date,
      name: item.name || '',
      category: item.category || (item.kind === 'misc' ? '통행료' : '엔진/미션'),
      fuelType: item.fuelType || '주유',
      payment: item.payment || '카드',
      cost: item.cost || 0,
      subsidy: item.subsidy || 0,
      mileage: item.mileage || 0,
      liters: item.liters || '',
    })
    setModalOpen(true)
  }

  function save() {
    const result = upsertExpense(readOwnerExpenses(ownerKey), { ...draft, kind: draft.kind || kind }, editingId)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    if (!persist(result.items)) return
    setModalOpen(false)
    showToast?.(editingId ? '내역을 수정했습니다.' : '내역을 등록했습니다.')
  }

  function remove(id) {
    if (!persist(removeExpense(readOwnerExpenses(ownerKey), id))) return
    showToast?.('내역을 삭제했습니다.')
  }

  return (
    <div className="page maint-fuel-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">정비/주유/기타</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="settings-segmented-control maint-fuel-tabs">
        {KINDS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`toggle-btn${kind === item.value ? ' active-work' : ''}`}
            onClick={() => setKind(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="maint-fuel-nav">
        <div className="date-navigator">
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => setViewDate((d) => shiftMonth(d, -1))}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="date-select-group">
            <select className="date-select" value={year} onChange={(e) => setViewDate(setYearMonth(viewDate, Number(e.target.value), month))}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="date-select" value={month} onChange={(e) => setViewDate(setYearMonth(viewDate, year, Number(e.target.value)))}>
              {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{m + 1}월</option>)}
            </select>
          </div>
          <button type="button" className="arrow-btn" title="다음 달" onClick={() => setViewDate((d) => shiftMonth(d, 1))}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-title">
          <span>이번 달 {kindLabel}</span>
          <span>{list.length}건</span>
        </div>
        <div className="summary-row total">
          <span>합계</span>
          <span className="summary-value">{formatWon(total)}</span>
        </div>
      </div>

      <div className="car-list">
        {groups.length === 0 && <div className="empty-state">이번 달 등록된 {kindLabel} 내역이 없습니다.</div>}
        {groups.map((group) => (
          <section key={group.date} className={`management-day-card ${kind}-day`}>
            <div className="management-day-head">
              <strong>{group.date}</strong>
              <div>
                <span>{kindLabel} 합계</span>
                <b>{formatWon(group.dailyTotal)}</b>
              </div>
            </div>
            <div className="management-day-items">
              {group.items.map((item) => (
                <div key={item.id} className={`management-record-item ${kind}-record`}>
                  <div className="management-record-head">
                    <div className="management-record-title">
                      <strong>{expenseTitle(item, kindLabel)}</strong>
                    </div>
                    <div className="management-record-actions">
                      <button type="button" className="action-icon-btn" onClick={() => openEdit(item)}>수정</button>
                      <button type="button" className="action-icon-btn del" onClick={() => remove(item.id)}>삭제</button>
                    </div>
                  </div>
                  <div className="management-record-info">
                    <div>
                      {item.kind !== 'fuel' && <span>{item.payment || '카드'}</span>}
                      {item.kind !== 'fuel' && item.category && <span>{item.category}</span>}
                      {item.kind === 'fuel' && item.mileage > 0 && <span>누적 {item.mileage.toLocaleString('ko-KR')}km</span>}
                      {item.kind === 'fuel' && item.subsidy > 0 && <span>보조금 {formatWon(item.subsidy)}</span>}
                      {item.kind !== 'fuel' && item.mileage > 0 && <span>누적 {item.mileage.toLocaleString('ko-KR')}km</span>}
                    </div>
                    <strong>{formatWon(item.cost)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <button type="button" className="management-add-fab" onClick={openAdd}>+ 추가</button>

      {modalOpen && (
        <ExpenseFormModal
          draft={draft}
          editingId={editingId}
          kindLabel={kindLabel}
          onChange={setDraft}
          onClose={() => setModalOpen(false)}
          onSave={save}
        />
      )}
    </div>
  )
}
