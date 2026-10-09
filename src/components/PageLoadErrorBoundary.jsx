// @ts-check
// 로드맵 33: 화면을 그리다 오류(주로 업데이트 뒤 옛 화면 파일을 못 받음)가 나면 앱 전체가 사라지는 대신 안내. 하단 메뉴는 그대로.
// 다른 화면으로 가면(resetKey 바뀜) 안내를 풀어 그 화면을 다시 그린다 — 평소엔 아무것도 다시 만들지 않는다.
import { Component } from 'react'
import './boot-retry.css'

/** @typedef {{ resetKey: string, children?: import('react').ReactNode }} BoundaryProps */

/** @extends {Component<BoundaryProps, { failed: boolean }>} */
export default class PageLoadErrorBoundary extends Component {
  /** @param {BoundaryProps} props */
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  /** @param {unknown} error */
  componentDidCatch(error) {
    console.error('[PageLoadErrorBoundary] 화면 오류:', error)
  }

  /** @param {BoundaryProps} prevProps */
  componentDidUpdate(prevProps) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="boot-retry" role="alert" style={{ position: 'static', minHeight: '60vh' }}>
        <h1>화면을 불러오지 못했습니다.</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button type="button" onClick={() => { window.location.reload() }}>다시 시도</button>
      </div>
    )
  }
}
