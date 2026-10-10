// @ts-check
// 불러오는 동안 글자·트럭 그림 대신 회색 뼈대(빛이 지나감). 모양은 skeleton.css.
import PageHeader from '../PageHeader.jsx'
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

/** @param {{ className?: string }} props */
function Bar({ className = '' }) {
  return <span className={`skeleton-bar ${className}`.trim()} aria-hidden="true" />
}

/** @param {number} count */
function range(count) {
  return Array.from({ length: count }, (_, index) => index)
}

/** 마이페이지 모양 — 개인정보 카드 + 바로가기 6칸 + 목록 3줄. 크기는 mypage.css를 따름. */
function MyPageShape() {
  return (
    <>
      <div className="skeleton-card skeleton-profile" aria-hidden="true">
        <Bar className="skeleton-icon" />
        <span className="skeleton-stack"><Bar className="skeleton-w30" /><Bar className="skeleton-w20 skeleton-thin" /></span>
      </div>
      <Bar className="skeleton-heading" />
      <div className="skeleton-shortcuts" aria-hidden="true">
        {range(6).map((index) => (
          <span key={index} className="skeleton-shortcut"><Bar className="skeleton-icon" /><Bar className="skeleton-label" /></span>
        ))}
      </div>
      <div className="skeleton-list" aria-hidden="true">
        {range(3).map((index) => (
          <span key={index} className="skeleton-list-row"><Bar className="skeleton-dot" /><Bar className="skeleton-w30" /></span>
        ))}
      </div>
    </>
  )
}

/** 매출 모양 — 위쪽 카드(날짜·년/월 탭·범위 탭) + 요약 카드 2. 크기는 revenue.css를 따름. */
function RevenueShape() {
  return (
    <>
      <div className="skeleton-card skeleton-revenue-top" aria-hidden="true">
        <Bar className="skeleton-date-nav" />
        <span className="skeleton-row"><Bar className="skeleton-tab" /><Bar className="skeleton-tab" /></span>
        <span className="skeleton-row skeleton-scope-row"><Bar className="skeleton-scope" /><Bar className="skeleton-scope" /><Bar className="skeleton-scope" /></span>
      </div>
      {range(2).map((card) => (
        <div key={card} className="skeleton-card skeleton-summary" aria-hidden="true">
          <Bar className="skeleton-w35" /><Bar className="skeleton-w85" /><Bar className="skeleton-w60" />
        </div>
      ))}
    </>
  )
}

/**
 * 화면 뼈대 — 화면 파일을 처음 받는 동안(AppShell Suspense).
 * 마이페이지·매출은 실제 화면 모양, 나머지는 제목 막대 + 카드 틀 3.
 * @param {Object} props
 * @param {string} [props.path] 지금 주소(어느 모양을 그릴지)
 * @param {() => void} [props.onOpenMenu]
 */
export function PageSkeleton({ path = '', onOpenMenu }) {
  const route = path.replace(/\/+$/, '')
  const shape = route === '/app/me' ? 'me' : route === '/app/revenue' ? 'revenue' : 'common'
  return (
    <div className={`page-skeleton${shape === 'common' ? '' : ' is-shaped'}`} data-shape={shape} role="status" aria-busy="true">
      {shape === 'me' && <PageHeader title="마이페이지" onOpenMenu={onOpenMenu} />}
      {shape === 'revenue' && <PageHeader title="매출" onOpenMenu={onOpenMenu} />}
      {shape === 'me' && <MyPageShape />}
      {shape === 'revenue' && <RevenueShape />}
      {shape === 'common' && (
        <>
          <Bar className="skeleton-title" />
          {range(3).map((group) => (
            <div key={group} className="skeleton-card skeleton-group" aria-hidden="true">
              {range(3).map((index) => <span key={index} className="skeleton-bar" />)}
            </div>
          ))}
        </>
      )}
      <span className="skeleton-sr">불러오는 중</span>
    </div>
  )
}
