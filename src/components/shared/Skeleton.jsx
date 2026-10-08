// @ts-check
// 로드맵 18-D: 불러오는 동안 글자·트럭 그림 대신 회색 뼈대(빛이 지나감). 모양은 skeleton.css.
import './skeleton.css'

/**
 * 막대 줄 뼈대 — 글자 자리.
 * @param {Object} props
 * @param {number} [props.lines] 막대 줄 수
 * @param {string} [props.label] 화면 읽기용 문구
 */
export function SkeletonLines({ lines = 2, label = '불러오는 중' }) {
  return (
    <div className="skeleton-lines" role="status" aria-busy="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} className="skeleton-bar" aria-hidden="true" />)}
      <span className="skeleton-sr">{label}</span>
    </div>
  )
}

/** 화면 뼈대 — 화면 파일을 처음 받는 동안(AppShell Suspense). 제목 막대 1 + 카드 상자 3. */
export function PageSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-busy="true">
      <span className="skeleton-bar skeleton-title" aria-hidden="true" />
      {[0, 1, 2].map((index) => <span key={index} className="skeleton-bar skeleton-card" aria-hidden="true" />)}
      <span className="skeleton-sr">불러오는 중</span>
    </div>
  )
}
