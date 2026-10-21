// @ts-check
// 8-C — 미수 화면 라우트 셸. lazyPages.js 진입점은 이 파일 그대로(RevenuePage.jsx와 동일 관례).
import { Route, Routes } from 'react-router-dom'
import ReceivablesListPage from './ReceivablesListPage.jsx'
import ReceivablesDetailPage from './ReceivablesDetailPage.jsx'
import { useSession } from '../../../data/cloud/sessionContext.js'

/**
 * @param {Object} props
 * @param {boolean} [props.isEmployedDriver] 연동 기사 계정이면 차량 배지를 안 그린다(자기 차가 "메인 차량"으로 보이지 않게).
 * @param {() => void} [props.onBack]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function ReceivablesPage({ isEmployedDriver = false, onBack, onOpenMenu }) {
  const { ownerKey } = useSession()
  const shared = { ownerKey, isEmployedDriver }
  return (
    <Routes>
      <Route index element={<ReceivablesListPage {...shared} onBack={onBack} onOpenMenu={onOpenMenu} />} />
      <Route path=":client/:month" element={<ReceivablesDetailPage {...shared} />} />
    </Routes>
  )
}
