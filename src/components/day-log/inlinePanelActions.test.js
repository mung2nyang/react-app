// 추가 버튼을 한 번 더 누르면 같은 새 입력 칸이 닫힘(보리 지시 2026-10-08), 다른 경우는 지금처럼 열림.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindInlinePanelActions } from './inlinePanelActions.js'

/** @param {{ modalOpen?: boolean, editingId?: string|null, kind?: string, callFormOpen?: boolean, editingCallId?: string|null }} state */
function setup(state) {
  /** @type {Array<string>} */
  const log = []
  const expenseForm = {
    modalOpen: !!state.modalOpen,
    editingId: state.editingId ?? null,
    draft: { kind: state.kind || 'maint' },
    closeAll: () => { log.push('expense:close') },
    openAdd: (/** @type {string} */ kind) => { log.push(`expense:open:${kind}`) },
    openEdit: () => { log.push('expense:edit') },
    openKindPick: () => { log.push('expense:pick') },
  }
  const dispatch = (/** @type {{ type: string, id?: string|null }} */ action) => { log.push(`call:${action.type}`) }
  const actions = bindInlinePanelActions(dispatch, expenseForm, { callFormOpen: !!state.callFormOpen, editingCallId: state.editingCallId ?? null })
  return { actions, log }
}

test('운행 일지 추가: 새 입력 칸이 열려 있으면 닫힘, 아니면 열림', () => {
  const open = setup({ callFormOpen: true })
  open.actions.openCallForm(null)
  assert.deepEqual(open.log, ['call:closeCallForm'])
  const closed = setup({ callFormOpen: false })
  closed.actions.openCallForm(null)
  assert.deepEqual(closed.log, ['expense:close', 'call:openCallForm'])
  const editing = setup({ callFormOpen: true, editingCallId: 'c1' })
  editing.actions.openCallForm(null)
  assert.deepEqual(editing.log, ['expense:close', 'call:openCallForm'], '고치던 칸에서 추가를 누르면 새 칸으로')
})

test('정비·주유·기타 추가: 같은 종류 새 칸이 열려 있으면 닫힘, 다른 종류·수정 중이면 그쪽으로 열림', () => {
  const same = setup({ modalOpen: true, kind: 'fuel' })
  same.actions.openExpenseAdd('fuel')
  assert.deepEqual(same.log, ['expense:close'])
  const other = setup({ modalOpen: true, kind: 'maint' })
  other.actions.openExpenseAdd('fuel')
  assert.deepEqual(other.log, ['call:closeCallForm', 'expense:open:fuel'])
  const editing = setup({ modalOpen: true, kind: 'fuel', editingId: 'e1' })
  editing.actions.openExpenseAdd('fuel')
  assert.deepEqual(editing.log, ['call:closeCallForm', 'expense:open:fuel'])
  const closed = setup({ modalOpen: false })
  closed.actions.openExpenseAdd('misc')
  assert.deepEqual(closed.log, ['call:closeCallForm', 'expense:open:misc'])
})
