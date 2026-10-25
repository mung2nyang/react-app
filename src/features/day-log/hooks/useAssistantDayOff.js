// @ts-check
// 운비서가 넘긴 휴무를 그 날짜 일지에 한 번 적용 — 휴무 단추와 같은 확인·같은 저장.
import { useEffect, useRef, useState } from 'react'
import { useToast } from '../../../shared/hooks/useToast.js'
import { confirmOffWithCalls } from '../ui/OffToggle.jsx'

/** @typedef {{ off: boolean }} AssistantDayOff */

/**
 * @param {Object} args
 * @param {AssistantDayOff|null} args.assistantDayOff 주소 상태에서 받은 값(지워지면 null)
 * @param {string} [args.assistantCallKey] 이동 키(location.key) — 같은 날짜에서 또 넘기면 바뀜
 * @param {{ isOff: boolean, fixedCount: number, callDetails: Array<object> }} args.draft
 * @param {(patch: { isOff?: boolean, fixedCount?: number }) => void} args.patchDraft
 * @param {number} args.month
 * @param {number} args.day
 */
export default function useAssistantDayOff({ assistantDayOff, assistantCallKey, draft, patchDraft, month, day }) {
  const showToast = useToast()
  const [handoff, setHandoff] = useState(/** @type {{ key: string|undefined, dayOff: AssistantDayOff|null }} */ ({ key: assistantCallKey, dayOff: assistantDayOff }))
  if (assistantDayOff && assistantCallKey !== handoff.key) setHandoff({ key: assistantCallKey, dayOff: assistantDayOff })
  const doneRef = useRef(/** @type {object|null} */ (null))
  // 콜 확인 창을 기다리는 사이 화면이 닫히면(계정 바뀜 등) 바꾸지 않는다.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  // 주소 상태가 지워진 뒤(assistantDayOff 없음)에 바꾼다 — 다시 그려도 같은 값은 한 번만.
  useEffect(() => {
    if (!handoff.dayOff || assistantDayOff || doneRef.current === handoff) return
    doneRef.current = handoff
    const { off } = handoff.dayOff
    if (draft.isOff === off) return
    void (async () => {
      if (!(await confirmOffWithCalls(off, draft.callDetails.length)) || !alive.current) return
      patchDraft({ isOff: off, fixedCount: off ? 0 : draft.fixedCount })
      showToast?.(off ? `${month}월 ${day}일을 휴무로 바꿨습니다.` : `${month}월 ${day}일 휴무를 취소했습니다.`)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로 넘긴 값이 생길 때만
  }, [handoff, assistantDayOff])
}
