// @ts-check
// 메인·서브 스코프를 한 화면에서 처리. 날짜별 목록은 MaintFuelDayList, 달 이동은 공용 MonthNavigator.
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import MonthNavigator from '../../../shared/ui/MonthNavigator.jsx'
import ExpenseFormModal from './ExpenseFormModal.jsx'
import MaintFuelDayList from './MaintFuelDayList.jsx'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import { resolveDriverOrPlateLabel } from '../../../domain/driverManagementContext.js'
import { getExpensesForLog } from '../../../domain/expenseScope.js'
import { saveExpenses } from '../../../data/sync/expensesSave.js'
import { filterMonth, groupExpensesByDate, KINDS, monthTotal } from '../../../domain/expenses.js'
import { emptyExpenseDraft, removeExpense, upsertExpense } from '../../../domain/expenseDraft.js'
import { formatWon } from '../../../domain/money.js'
import { readOwnerExpenses, useOwnerCars, useOwnerDrivers, useOwnerExpenses } from '../../../data/store/ownerDataHooks.js'
import { getCloudOwnerKey } from '../../../data/cloud/cloudSession.js'
import { saveFailMessage } from '../../../shared/utils/failureMessages.js'
import './maint-fuel.css'
import { useToast } from '../../../shared/hooks/useToast.js'
import { useSession } from '../../../data/cloud/sessionContext.js'

/** @typedef {import('../../../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../../../domain/expenseTypes.js').ExpenseDraft} ExpenseDraft */

/**
 * @param {Object} props
 * @param {string} [props.logId]
 * @param {() => void} [props.onBack]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function MaintFuelPage({ logId: logIdProp, onBack, onOpenMenu }) {
  const { ownerKey } = useSession()
  const showToast = useToast()
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
    ? '차량 유지비'
    : `${resolveDriverOrPlateLabel(logId, drivers, cars)} 차량 유지비`

  /** @param {Array<ExpenseItem>} next @returns {Promise<boolean>} */
  async function persist(next) {
    try {
      await saveExpenses(ownerKey, next)
      return true
    } catch (error) {
      console.error('비용 저장 실패:', error)
      showToast?.(saveFailMessage(getCloudOwnerKey() === ownerKey))
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

      <div className="maint-top-card">
        <MonthNavigator viewDate={viewDate} onChange={setViewDate} />
        <div className="settings-segmented-control maint-fuel-tabs maint-management-tabs">
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
        <div className="maint-month-summary">
          <strong className={monthLabelClass}>{month + 1}월 {kindLabel}</strong>
          <span>합계</span>
          <b>{formatWon(total)}</b>
        </div>
      </div>

      <MaintFuelDayList groups={groups} kind={kind} kindLabel={kindLabel} onEdit={openEdit} onDelete={remove} />

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
