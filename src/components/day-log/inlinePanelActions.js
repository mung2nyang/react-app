// @ts-check
// Step 6 재감사(FAIL 지적 6번) — 콜상세 인라인 패널(day-log-reducer의 callFormOpen)과
// 정비/주유/기타 인라인 패널(useExpenseForm의 kindPick/modalOpen)은 서로 다른
// state에 있어서, 하나를 열어도 다른 쪽이 안 닫혔다(두 InlineSheet가 동시에
// is-visible일 수 있었다). DayLogPage.jsx가 이 함수 하나로 만든 "열기 진입점"만
// 쓰게 해서, 여는 쪽이 항상 반대쪽을 먼저 닫도록 강제한다. 순수 훅은 아니지만(내부에
// React 훅을 쓰지 않는다) DayLogPage.jsx 200줄 제한 때문에 분리했다 — 200줄 넘긴다고
// 로직 없이 기계적으로 쪼개지 말라는 지시가 있어, 실제로 독립된 책임(패널 상호배제)
// 하나를 통째로 옮겼다.
// 추가 버튼을 한 번 더 누르면 열려 있던 같은 새 입력 칸을 닫는다(보리 지시 2026-10-08).
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
