// @ts-check
// 운비서가 넘긴 고정 노선을 그 날짜 일지에 한 번 더한다 — 노선 칩·횟수 칸과 같은 동작(로드맵 24-F-2).
import { useEffect, useRef, useState } from 'react'
import { useToast } from '../../../shared/hooks/useToast.js'

/** @typedef {{ count: number, route: string, cancelOff: boolean }} AssistantFixed */

/**
 * @param {Object} args
 * @param {AssistantFixed|null} args.assistantFixed 주소 상태에서 받은 값(지워지면 null)
 * @param {string} [args.assistantCallKey] 이동 키(location.key) — 같은 날짜에서 또 넘기면 바뀜
 * @param {boolean} args.fixedOn 고정 노선 칸이 보이는 일지인가
 * @param {Array<{ id: string, loadLoc: string, unloadLoc: string }>} args.routePresets 그날 보이는 노선 칩
 * @param {{ isOff: boolean, fixedCount: number }} args.draft
 * @param {(patch: { isOff?: boolean, fixedCount?: number }) => void} args.patchDraft
 * @param {(routeId: string, delta: number) => void} args.runRoute
 */
export default function useAssistantFixed({ assistantFixed, assistantCallKey, fixedOn, routePresets, draft, patchDraft, runRoute }) {
  const showToast = useToast()
  const [handoff, setHandoff] = useState(/** @type {{ key: string|undefined, fixed: AssistantFixed|null }} */ ({ key: assistantCallKey, fixed: assistantFixed }))
  if (assistantFixed && assistantCallKey !== handoff.key) setHandoff({ key: assistantCallKey, fixed: assistantFixed })
  const doneRef = useRef(/** @type {object|null} */ (null))
  // 주소 상태가 지워진 뒤(assistantFixed 없음)에 더한다 — 다시 그려도 같은 값은 한 번만.
  useEffect(() => {
    if (!handoff.fixed || assistantFixed || doneRef.current === handoff) return
    doneRef.current = handoff
    const next = handoff.fixed
    if (!fixedOn) return
    // "휴무 취소하고 기록"이면 휴무를 끄고 더한다(휴무 단추와 같은 저장). 휴무 그대로면 칩처럼 더하지 않는다.
    if (draft.isOff && !next.cancelOff) return
    if (draft.isOff) patchDraft({ isOff: false, fixedCount: draft.fixedCount })
    const preset = next.route ? routePresets.find((route) => `${route.loadLoc} → ${route.unloadLoc}` === next.route) : undefined
    if (preset) runRoute(preset.id, next.count)
    else patchDraft({ fixedCount: (Number(draft.fixedCount) || 0) + next.count })
    showToast?.(`${preset ? next.route : '고정 노선'} ${next.count}회를 더했습니다.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로 넘긴 값이 생길 때만
  }, [handoff, assistantFixed])
}
