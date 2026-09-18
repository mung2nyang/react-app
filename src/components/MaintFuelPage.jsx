// @ts-check
// 메인·서브 스코프를 한 화면에서 처리 — AGENTS §6 ≤250.
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import CalendarDateSelect from './calendar/CalendarDateSelect.jsx'
import ExpenseFormModal from './ExpenseFormModal.jsx'
import PageHeader from './PageHeader.jsx'
import CardActionButtons from './shared/CardActionButtons.jsx'
import { resolveDriverOrPlateLabel } from '../domain/driverManagementContext.js'
import { getExpensesForLog } from '../domain/expenseScope.js'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import {
  emptyExpenseDraft, expenseTitle, filterMonth, groupExpensesByDate, KINDS,
  monthTotal, removeExpense, saveExpenses, upsertExpense,
} from '../lib/expenses.js'
import { formatWon } from '../lib/money.js'
import { readOwnerExpenses, useOwnerCars, useOwnerDrivers, useOwnerExpenses } from '../store/ownerDataHooks.js'
import './maint-fuel.css'

/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../domain/expenseTypes.js').ExpenseDraft} ExpenseDraft */

const YEAR_OPTIONS = getYearOptions()

/** @param {{ kind: ExpenseItem['kind'] }} props */
function KindRecordIcon({ kind }) {
  if (kind === 'fuel') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <line x1="3" x2="15" y1="22" y2="22"></line>
        <line x1="4" x2="14" y1="9" y2="9"></line>
        <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path>
        <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"></path>
      </svg>
    )
  }
  if (kind === 'misc') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h18"></path>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>
  )
}

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {string} [props.logId]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function MaintFuelPage({ ownerKey = 'guest', logId: logIdProp, onBack, showToast, onOpenMenu }) {
  const { logId: rawLogId } = useParams()
  const logId = logIdProp ?? (rawLogId ? decodeURIComponent(rawLogId) : undefined)
  const items = useOwnerExpenses(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const [kind, setKind] = useState(/** @type {ExpenseItem['kind']} */ ('maint'))
  const [viewDate, setViewDate] = useState(() => new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(/** @type {ExpenseDraft} */ (emptyExpenseDraft('maint')))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const scopedItems = useMemo(() => getExpensesForLog(items, logId), [items, logId])
  const list = useMemo(() => filterMonth(scopedItems, kind, year, month), [scopedItems, kind, year, month])
  const groups = useMemo(() => groupExpensesByDate(list), [list])
  const total = monthTotal(scopedItems, kind, year, month)
  const kindLabel = KINDS.find((item) => item.value === kind)?.label || '정비'
  const title = !logId || logId === 'main'
    ? '정비/주유/기타'
    : `${resolveDriverOrPlateLabel(logId, drivers, cars)} 정비/주유/기타`

  /** @param {Array<ExpenseItem>} next @returns {Promise<boolean>} */
  async function persist(next) {
    try {
      await saveExpenses(ownerKey, next)
      return true
    } catch (error) {
      console.error('비용 저장 실패:', error)
      showToast?.('저장하지 못했습니다. 저장 공간을 확인해 주세요.')
      return false
    }
  }

  function openAdd() {
    setEditingId(null)
    setDraft(emptyExpenseDraft(kind, undefined, logId && logId !== 'main' ? logId : undefined))
    setModalOpen(true)
  }

  /** @param {ExpenseItem} item */
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
      vehicleNumber: item.vehicleNumber,
    })
    setModalOpen(true)
  }

  async function save() {
    const result = upsertExpense(readOwnerExpenses(ownerKey), { ...draft, kind: draft.kind || kind }, editingId)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    if (!await persist(result.items)) return
    setModalOpen(false)
    showToast?.(editingId ? '내역을 수정했습니다.' : '내역을 등록했습니다.')
  }

  /** @param {string} id */
  async function remove(id) {
    if (!await persist(removeExpense(readOwnerExpenses(ownerKey), id))) return
    showToast?.('내역을 삭제했습니다.')
  }

  const monthLabelClass = kind === 'fuel' ? 'fuel-color' : kind === 'misc' ? 'misc-color' : undefined

  return (
    <div className="page maint-fuel-page">
      <PageHeader title={title} onBack={onBack} onOpenMenu={onOpenMenu} />

      <div className="maint-fuel-nav">
        <div className="date-navigator">
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => setViewDate((d) => shiftMonth(d, -1))}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="date-select-group">
            <CalendarDateSelect
              label="년도 선택"
              value={year}
              options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: `${y}년` }))}
              onChange={(next) => setViewDate(setYearMonth(viewDate, Number(next), month))}
            />
            <CalendarDateSelect
              label="월 선택"
              value={month}
              options={Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: `${m + 1}월` }))}
              onChange={(next) => setViewDate(setYearMonth(viewDate, year, Number(next)))}
            />
          </div>
          <button type="button" className="arrow-btn" title="다음 달" onClick={() => setViewDate((d) => shiftMonth(d, 1))}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
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
                      <KindRecordIcon kind={kind} />
                      <strong>{expenseTitle(item, kindLabel)}</strong>
                    </div>
                    <div className="management-record-actions">
                      <CardActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => remove(item.id)}
                      />
                    </div>
                  </div>
                  <div className="management-record-info">
                    <div>
                      {item.kind !== 'fuel' && <span>{item.payment || '카드'}</span>}
                      {item.kind !== 'fuel' && item.category && <span>{item.category}</span>}
                      {item.kind === 'fuel' && (item.mileage || 0) > 0 && <span>누적 {(item.mileage || 0).toLocaleString('ko-KR')}km</span>}
                      {item.kind === 'fuel' && (item.subsidy || 0) > 0 && <span>보조금 {formatWon(item.subsidy)}</span>}
                      {item.kind !== 'fuel' && (item.mileage || 0) > 0 && <span>누적 {(item.mileage || 0).toLocaleString('ko-KR')}km</span>}
                    </div>
                    <strong>{formatWon(item.cost)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="maint-management-dock">
        <div className="maint-month-summary">
          <div>
            <strong className={monthLabelClass}>{month + 1}월 {kindLabel}</strong>
            <span>합계</span>
            <b>{formatWon(total)}</b>
          </div>
          <button type="button" onClick={openAdd}>+ 추가</button>
        </div>
        <div className="maint-fuel-tabs maint-management-tabs">
          {KINDS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`toggle-btn${kind === item.value ? ' active-work' : ''}`}
              onClick={() => setKind(/** @type {ExpenseItem['kind']} */ (item.value))}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

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
