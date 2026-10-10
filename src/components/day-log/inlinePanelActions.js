// @ts-check
// 콜상세 패널과 정비/주유/기타 패널은 state가 따로라, 이 열기 진입점으로만 열어 반대쪽을 먼저 닫게 한다(두 칸 동시 열림 방지).
// 추가 버튼을 한 번 더 누르면 열려 있던 같은 새 입력 칸을 닫는다.
/**
 * @param {(action: import('./day-log-reducer.js').DayLogAction) => void} dispatch
 * @param {{ closeAll: () => void, openAdd: (kind: string) => void, openEdit: (item: import('./dayLogTypes.js').ExpenseItem) => void, openKindPick: () => void, modalOpen: boolean, editingId: string|null, draft: { kind?: string } }} expenseForm
 * @param {{ callFormOpen: boolean, editingCallId: string|null }} callPanel 지금 콜상세 칸 상태
 */
export function bindInlinePanelActions(dispatch, expenseForm, callPanel) {
  return {
    /** @param {string|null} id */
    openCallForm(id) {
      if (id === null && callPanel.callFormOpen && callPanel.editingCallId === null) {
        dispatch({ type: 'closeCallForm' })
        return
      }
      expenseForm.closeAll()
      dispatch({ type: 'openCallForm', id })
    },
    /** @param {string} kind */
    openExpenseAdd(kind) {
      if (expenseForm.modalOpen && expenseForm.editingId === null && expenseForm.draft.kind === kind) {
        expenseForm.closeAll()
        return
      }
      dispatch({ type: 'closeCallForm' })
      expenseForm.openAdd(kind)
    },
    /** @param {import('./dayLogTypes.js').ExpenseItem} item */
    openExpenseEdit(item) {
      dispatch({ type: 'closeCallForm' })
      expenseForm.openEdit(item)
    },
    openExpenseKindPick() {
      dispatch({ type: 'closeCallForm' })
      expenseForm.openKindPick()
    },
  }
}
