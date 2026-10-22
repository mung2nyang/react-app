// @ts-check
// 일지의 정비/주유/기타 관리 상태. 비용은 day record와 별도로 expenses 스토어에 즉시 저장한다(디바운스 없음).
// 화면은 useOwnerExpenses로 구독하고, 저장·삭제는 saveExpenseDraft·deleteExpense(최신 목록을 다시 읽어 고침).
import { useState } from 'react'
import { deleteExpense, saveExpenseDraft } from '../../../data/sync/expensesSave.ts'
import { emptyExpenseDraft, expenseToDraft } from '../../../domain/expenseDraft.ts'
import { useOwnerExpenses } from '../../../data/store/ownerDataHooks.ts'
import { useToast } from '../../../shared/hooks/useToast.js'

/** @typedef {import('../ui/dayLogTypes.js').ExpenseItem} ExpenseItem */

/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {string} [logId]
 */
export function useExpenseForm(ownerKey, dateKey, logId = 'main') {
  const showToast = useToast()
  const expenses = useOwnerExpenses(ownerKey)
  const [kindPick, setKindPick] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(() => emptyExpenseDraft('maint', dateKey))

  /** @param {string} kind */
  function openAdd(kind) {
    if (kindPick) {
      setKindPick(false)
      setTimeout(() => {
        setEditingId(null)
        setDraft(emptyExpenseDraft(kind, dateKey, logId !== 'main' ? logId : undefined))
        setModalOpen(true)
      }, 420)
      return
    }
    setKindPick(false)
    setEditingId(null)
    setDraft(emptyExpenseDraft(kind, dateKey, logId !== 'main' ? logId : undefined))
    setModalOpen(true)
  }

  /** @param {ExpenseItem} item */
  function openEdit(item) {
    setKindPick(false)
    setEditingId(item.id)
    setDraft(expenseToDraft(item, dateKey))
    setModalOpen(true)
  }

  /** @param {string} id */
  async function remove(id) {
    const message = await deleteExpense(ownerKey, id)
    if (message) showToast?.(message)
  }

  async function save() {
    const message = await saveExpenseDraft(ownerKey, { ...draft, date: dateKey }, editingId)
    if (message) {
      // 모달을 안 닫는다 — draft가 그대로 남아 있어야 사용자가 다시 저장을 시도할 수
      // 있다.
      showToast?.(message)
      return
    }
    setModalOpen(false)
    showToast?.(editingId ? '내역을 수정했습니다.' : '내역을 등록했습니다.')
  }

  function openKindPick() { setModalOpen(false); setKindPick(true) }
  // DayLogPage.jsx가 콜상세 폼을 열 때 이걸 불러서 정비/주유/
  // 기타 폼(kindPick·modalOpen)을 함께 닫는다. 두 인라인 패널이 동시에 DOM에 있으면
  // 안 된다는 요구를 이 훅 쪽에서 한 함수로 제공한다.
  function closeAll() { setKindPick(false); setModalOpen(false) }

  return { expenses, kindPick, modalOpen, editingId, draft, setDraft, openAdd, openEdit, remove, save, openKindPick, closeAll, closeModal: () => setModalOpen(false) }
}
