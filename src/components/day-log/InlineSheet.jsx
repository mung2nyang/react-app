// @ts-check
// Step 6(일지 재작성): InlineExpandHost.jsx 폐기 — ResizeObserver로 scrollHeight를
// 재서 max-height를 맞추던 JS 애니메이션을, migration-plan.md 3.2가 제안한 CSS
// grid-template-rows 트릭으로 대체한다. 내용 높이를 몰라도 되고(`0fr` ↔ `1fr`),
// 옵저버·프레임 타이밍 코드가 전혀 없다 — 열려 있을 때만 마운트한다(닫히면 폼
// 내부 state도 완전히 사라진다, 예전처럼 DOM을 다른 곳에 붙였다 뗐다 하지 않는다).
/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {string} [props.className]
 * @param {import('react').ReactNode} props.children
 */
export default function InlineSheet({ open, className = '', children }) {
  return (
    <div className={`inline-sheet ${className}${open ? ' is-visible' : ''}`.trim()} aria-hidden={!open}>
      {open && <div className="inline-sheet-panel">{children}</div>}
    </div>
  )
}
