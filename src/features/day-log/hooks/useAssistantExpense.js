// @ts-check
// 운비서가 넘긴 지출로 그 종류 지출 창을 채워 한 번 연다(로드맵 24-C-2). 저장은 지금 지출 창 그대로.
import { useEffect, useRef, useState } from 'react'

/** @typedef {{ type: 'maint'|'fuel'|'misc', cost: number|null, name: string, category: string, fuelType: string, payment: string, cancelOff: boolean }} AssistantExpense */
/** @typedef {import('../../../domain/expenseTypes.ts').ExpenseDraft} ExpenseDraft */

/** 빈 칸은 넣지 않는다 — 지출 창의 기본값(분류 첫 항목·"주유"·"카드")이 그대로 남는다. @param {AssistantExpense} expense @returns {ExpenseDraft} */
function presetOf(expense) {
  return {
    ...(expense.cost !== null ? { cost: expense.cost } : {}),
    ...(expense.name ? { name: expense.name } : {}),
    ...(expense.category ? { category: expense.category } : {}),
    ...(expense.fuelType ? { fuelType: expense.fuelType } : {}),
    ...(expense.payment ? { payment: expense.payment } : {}),
  }
}

/**
 * @param {Object} args
 * @param {AssistantExpense|null} args.assistantExpense 주소 상태에서 받은 값(지워지면 null)
 * @param {string} [args.assistantCallKey] 이동 키(location.key) — 같은 날짜에서 또 넘기면 바뀜
 * @param {{ isOff: boolean, fixedCount: number }} args.draft
 * @param {(action: import('./day-log-reducer.js').DayLogAction) => void} args.dispatch
 * @param {(kind: string, preset?: ExpenseDraft) => void} args.openAdd
 * @param {() => Promise<boolean>} args.confirmLeaveOpenPanel
 */
export default function useAssistantExpense({ assistantExpense, assistantCallKey, draft, dispatch, openAdd, confirmLeaveOpenPanel }) {
  const [handoff, setHandoff] = useState(/** @type {{ key: string|undefined, expense: AssistantExpense|null }} */ ({ key: assistantCallKey, expense: assistantExpense }))
  if (assistantExpense && assistantCallKey !== handoff.key) setHandoff({ key: assistantCallKey, expense: assistantExpense })
  const askedRef = useRef(/** @type {object|null} */ (null))
  // 주소 상태가 지워진 뒤(assistantExpense 없음)에 연다 — 같이 바뀌면 뒤로가기 붙잡기가 나가기로 안다.
  useEffect(() => {
    if (!handoff.expense || assistantExpense || askedRef.current === handoff) return
    askedRef.current = handoff
    const next = handoff.expense
    // 입력 칸이 열려 있으면 기존 확인 창을 먼저 — [계속 입력]이면 채우지 않는다.
    void confirmLeaveOpenPanel().then((ok) => {
      setHandoff((prev) => ({ ...prev, expense: null }))
      if (!ok) return
      // "휴무 취소하고 기록"이면 휴무를 끄고 연다(휴무 단추와 같은 저장).
      if (next.cancelOff && draft.isOff) dispatch({ type: 'patchDraft', patch: { isOff: false, fixedCount: draft.fixedCount } })
      dispatch({ type: 'closeCallForm' })
      openAdd(next.type, presetOf(next))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로 넘긴 값이 생길 때만
  }, [handoff, assistantExpense])
}
