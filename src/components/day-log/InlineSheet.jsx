// @ts-check
// CSS grid 0fr↔1fr 슬라이드. 직접 닫을 땐 transitionend까지 자식을 유지하고,
// 다른 시트로 전환(forceInstant)일 땐 즉시 제거해 두 폼 동시 DOM을 막는다.
// 열리는 동안은 overflow:hidden으로 클립하고, 전환 완료(is-settled) 후에만 visible.
import { useEffect, useState } from 'react'

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {boolean} [props.forceInstant]
 * @param {string} [props.className]
 * @param {import('react').ReactNode} props.children
 */
export default function InlineSheet({ open, forceInstant = false, className = '', children }) {
  const [mounted, setMounted] = useState(open)
  const [settled, setSettled] = useState(false)

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
    if (open) setSettled(true)
    else setMounted(false)
  }

  return (
    <div
      className={`inline-sheet ${className}${open ? ' is-visible' : ''}${settled ? ' is-settled' : ''}`.trim()}
      aria-hidden={!open}
      onTransitionEnd={handleTransitionEnd}
    >
      {mounted && <div className="inline-sheet-panel">{children}</div>}
    </div>
  )
}
