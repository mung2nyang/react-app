// @ts-check
// CSS grid 0fr↔1fr 슬라이드. 직접 닫을 땐 transitionend까지 자식을 유지하고,
// 다른 시트로 전환(forceInstant)일 땐 즉시 제거해 두 폼 동시 DOM을 막는다.
// 열리는 동안은 overflow:hidden으로 클립하고, 전환 완료(is-settled) 후에만 visible.
// 부모가 children을 조건부 언마운트해도 닫히는 동안엔 마지막 내용을 유지한다.
// 로드맵 20-A: 펼쳐짐이 끝났을 때·열린 채 scrollKey(고르는 항목)가 바뀔 때 칸 맨 위로 내려간다(화면 밖에서 열려 모르던 문제).
import { useEffect, useRef, useState } from 'react'

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {boolean} [props.forceInstant]
 * @param {string} [props.className]
 * @param {string} [props.scrollKey] 지금 칸에 띄운 항목 — 바뀌면 다시 내려감. 없으면 내려가지 않음
 * @param {import('react').ReactNode} props.children
 */
export default function InlineSheet({ open, forceInstant = false, className = '', scrollKey, children }) {
  const [mounted, setMounted] = useState(open)
  const [settled, setSettled] = useState(false)
  const lastChildrenRef = useRef(children)
  const panelRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const scrolledKeyRef = useRef(/** @type {string|undefined} */ (undefined))
  if (open) lastChildrenRef.current = children

  function scrollToPanel() {
    const panel = panelRef.current
    scrolledKeyRef.current = scrollKey
    if (scrollKey === undefined || !panel || typeof panel.scrollIntoView !== 'function') return
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    panel.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }

  useEffect(() => {
    if (open && settled && scrollKey !== scrolledKeyRef.current) scrollToPanel()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 고르는 항목이 바뀔 때만
  }, [scrollKey, open, settled])

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setSettled(false)
    if (forceInstant) setMounted(false)
  }, [open, forceInstant])

  /**
   * @param {import('react').TransitionEvent<HTMLDivElement>} event
   */
  function handleTransitionEnd(event) {
    if (event.target !== event.currentTarget) return
    if (event.propertyName !== 'grid-template-rows') return
    if (open) {
      setSettled(true)
      scrollToPanel()
    } else setMounted(false)
  }

  return (
    <div
      className={`inline-sheet ${className}${open ? ' is-visible' : ''}${settled ? ' is-settled' : ''}`.trim()}
      aria-hidden={!open}
      onTransitionEnd={handleTransitionEnd}
    >
      {mounted && <div ref={panelRef} className="inline-sheet-panel">{open ? children : lastChildrenRef.current}</div>}
    </div>
  )
}
