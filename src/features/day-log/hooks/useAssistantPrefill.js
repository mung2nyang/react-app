// @ts-check
// 운비서가 넘긴 운행으로 일지의 새 입력 창을 채워 연다(로드맵 24-B-2·3-A·3-B). 저장은 지금 입력 창 그대로.
import { useEffect, useRef, useState } from 'react'

/** @typedef {{ loadLoc: string, unloadLoc: string, fare: number|null, client: string, cancelOff: boolean }} AssistantCall */

/**
 * @param {Object} args
 * @param {AssistantCall|null} args.assistantCall 주소 상태에서 받은 값(지워지면 null)
 * @param {string} [args.assistantCallKey] 이동 키(location.key)
 * @param {boolean} args.callDetailOn
 * @param {{ isOff: boolean, fixedCount: number }} args.draft
 * @param {boolean} args.callFormOpen
 * @param {string|null} args.editingCallId
 * @param {(action: import('./day-log-reducer.js').DayLogAction) => void} args.dispatch
 * @param {() => void} args.closeExpense
 * @param {() => Promise<boolean>} args.confirmLeaveOpenPanel
 * @returns {{ prefill: AssistantCall|null, formKey: string }}
 */
export default function useAssistantPrefill({ assistantCall, assistantCallKey, callDetailOn, draft, callFormOpen, editingCallId, dispatch, closeExpense, confirmLeaveOpenPanel }) {
  // 운비서가 채운 값으로 새 입력 창을 한 번 연다. 닫거나 저장하면 버린다.
  const [prefill, setPrefill] = useState(() => (assistantCall && callDetailOn ? assistantCall : null))
  const [prefillShown, setPrefillShown] = useState(false)
  const [formKey, setFormKey] = useState('new')
  if (prefill && !prefillShown && callFormOpen && !editingCallId) setPrefillShown(true)
  if (prefill && prefillShown && (!callFormOpen || editingCallId)) setPrefill(null)
  // 주소 상태가 지워진 뒤(assistantCall 없음)에 연다 — 같이 바뀌면 뒤로가기 붙잡기가 나가기로 안다.
  useEffect(() => {
    if (!prefill || prefillShown || assistantCall) return
    // 운비서에서 "휴무 취소하고 기록"을 눌렀으면 휴무를 끄고 연다(휴무 단추와 같은 저장).
    if (prefill.cancelOff && draft.isOff) dispatch({ type: 'patchDraft', patch: { isOff: false, fixedCount: draft.fixedCount } })
    dispatch({ type: 'openCallForm', id: null })
  }, [prefill, prefillShown, assistantCall, draft.isOff, draft.fixedCount, dispatch])

  // 같은 날짜 일지에서 운비서가 또 넘기면(이동 키가 바뀜) 새 입력 창으로 다시 연다.
  const [handoff, setHandoff] = useState(/** @type {{ key: string|undefined, call: AssistantCall|null }} */ ({ key: assistantCallKey, call: null }))
  if (assistantCall && assistantCallKey !== handoff.key) setHandoff({ key: assistantCallKey, call: assistantCall })
  const askedRef = useRef(/** @type {object|null} */ (null))
  useEffect(() => {
    if (!handoff.call || assistantCall || askedRef.current === handoff) return
    askedRef.current = handoff
    const next = handoff.call
    // 입력 칸이 열려 있으면 기존 확인 창을 먼저 — [계속 입력]이면 채우지 않는다.
    void confirmLeaveOpenPanel().then((ok) => {
      setHandoff((prev) => ({ ...prev, call: null }))
      if (!ok || !callDetailOn) return
      closeExpense()
      dispatch({ type: 'closeCallForm' })
      setPrefill(next)
      setPrefillShown(false)
      setFormKey(`new:${handoff.key}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로 넘긴 값이 생길 때만
  }, [handoff, assistantCall])

  return { prefill: editingCallId ? null : prefill, formKey }
}
