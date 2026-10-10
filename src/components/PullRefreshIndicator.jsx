// @ts-check
// 당겨서 새로고침 표시 — 평소엔 화면 위 밖에 숨어 있다가 당긴 만큼 내려옴. 모양은 pull-refresh.css.
import usePullToRefresh, { PULL_TRIGGER } from '../app/usePullToRefresh.js'
import './pull-refresh.css'

export default function PullRefreshIndicator() {
  const { distance, dragging, refreshing } = usePullToRefresh()
  const ready = distance >= PULL_TRIGGER
  const className = `pull-refresh${dragging ? ' is-dragging' : ''}${ready ? ' is-ready' : ''}${refreshing ? ' is-refreshing' : ''}`
  return (
    <div className={className} style={{ transform: `translateY(${distance}px)` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" style={{ transform: `rotate(${Math.round(distance * 4)}deg)` }}>
        <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
        <polyline points="21 3 21 9 15 9"></polyline>
      </svg>
    </div>
  )
}
