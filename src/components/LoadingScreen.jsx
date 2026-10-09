// @ts-check
// 10-L 로딩 표시 "🚚 운행일지 ● ● ●" — 모양 CSS는 index.html <style>(앱 파일이 오기 전과 같은 모양), 여기선 같은 클래스만 쓴다.
import { assetPath } from '../lib/assetPath.js'

const BANNER = assetPath('/images/banner_image.png')

/**
 * @param {Object} props
 * @param {boolean} [props.inline] 화면 안(하단 메뉴는 그대로)에 놓을 때 — 화면을 처음 열 때(Suspense)
 */
export default function LoadingScreen({ inline = false }) {
  return (
    <div className={`boot-loading${inline ? ' boot-loading-inline' : ''}`} role="status" aria-label="불러오는 중">
      <img src={BANNER} alt="" />
      <span className="boot-loading-name">운행일지</span>
      <span className="boot-loading-dots" aria-hidden="true"><span></span><span></span><span></span></span>
    </div>
  )
}
