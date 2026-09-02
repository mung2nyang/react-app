// @ts-check
// 8-C — 미수 화면 라우트 셸. lazyPages.js 진입점은 이 파일 그대로(RevenuePage.jsx와 동일 관례).
import { Route, Routes } from 'react-router-dom'
import ReceivablesListPage from './receivables/ReceivablesListPage.jsx'
import ReceivablesDetailPage from './receivables/ReceivablesDetailPage.jsx'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onWorkChanged]
 */
export default function ReceivablesPage({ ownerKey = 'guest', onBack, showToast, onWorkChanged }) {
  const shared = { ownerKey, showToast, onWorkChanged }
  return (
    <Routes>
      <Route index element={<ReceivablesListPage {...shared} onBack={onBack} />} />
      <Route path=":client/:month" element={<ReceivablesDetailPage {...shared} />} />
    </Routes>
  )
}
