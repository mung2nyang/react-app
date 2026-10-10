// @ts-check
// 일지의 정비/주유/기타 관리 상태. 비용은 day record와 별도로 expenses 스토어에 즉시 저장한다(디바운스 없음).
// 화면은 useOwnerExpenses로 구독하고, 저장·삭제 직전엔 readOwnerExpenses로 최신값을 다시 읽는다 — 옛 값으로 덮어쓰지 않게.
import { useState } from 'react'
import { emptyExpenseDraft, saveExpenses, upsertExpense } from '../../lib/expenses.js'
import { readOwnerExpenses, useOwnerExpenses } from '../../store/ownerDataHooks.js'

/** @typedef {import('./dayLogTypes.js').ExpenseItem} ExpenseItem */

/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {(message: string) => void} [showToast]
 * @param {string} [logId]
 */
export function useExpenseForm(ownerKey, dateKey, showToast, logId = 'main') {
  // store/app-store.js가 아직 // @ts-check 대상이 아니라 expenses 슬라이스를 느슨한
  // object[]로 선언해 뒀다 — 실제 런타임 모양(lib/expenses.js가 다루는 ExpenseItem[])으로
  // 여기서 좁힌다(day-record.js의 readOwnerWorkData 결과를 ownerDataHooks.js 자신이
  // DayRecordLike로 좁히는 것과 같은 이유·자리).
  const expenses = /** @type {Array<ExpenseItem>} */ (useOwnerExpenses(ownerKey))
  const [kindPick, setKindPick] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(() => emptyExpenseDraft('maint', dateKey))

  // saveExpenses(quota 초과 등으로 던질 수 있다)가 던지면 그대로 던진다 — 호출부
  // (save/remove)가 잡아서 토스트로 알리고, 실패 시 store/localStorage 둘 다 그대로
  // 남는다(commitExpenses→commitBatch→writeAllOrNothing이 이미 원자적). 여기서
  // React state를 따로 안 바꾼다 — expenses는 이제 store 구독값이라 성공하면 store의
  // notify를 통해 저절로 최신값으로 리렌더된다(거짓 "저장됨" 화면이 구조적으로 불가능).
  /** @param {Array<ExpenseItem>} next */
  async function persist(next) { await saveExpenses(ownerKey, next) }

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
    setDraft({
      kind: item.kind, date: dateKey, name: item.name || '',
      category: item.category || (item.kind === 'misc' ? '통행료' : '엔진/미션'),
      fuelType: item.fuelType || '주유', payment: item.payment || '카드',
      cost: item.cost || 0, subsidy: item.subsidy || 0, mileage: item.mileage || 0,
      liters: String(item.liters || ''),
      vehicleNumber: item.vehicleNumber,
    })
    setModalOpen(true)
  }

  /** @param {string} id */
  async function remove(id) {
    try {
      await persist(/** @type {Array<ExpenseItem>} */ (readOwnerExpenses(ownerKey)).filter((item) => item.id !== id))
    } catch (error) {
      console.error('비용 삭제 실패:', error)
      showToast?.('삭제하지 못했습니다. 저장 공간을 확인해 주세요.')
    }
  }

  async function save() {
    const result = upsertExpense(/** @type {Array<ExpenseItem>} */ (readOwnerExpenses(ownerKey)), { ...draft, date: dateKey }, editingId)
    if (result.error) { showToast?.(result.error); return }
    try {
      await persist(result.items)
    } catch (error) {
      // 모달을 안 닫는다 — draft가 그대로 남아 있어야 사용자가 다시 저장을 시도할 수
      // 있다.
      console.error('비용 저장 실패:', error)
      showToast?.('저장하지 못했습니다. 저장 공간을 확인해 주세요.')
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
