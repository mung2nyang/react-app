// Step 3 라우터 셸: `/onboarding`, `/app/*`는 세션이 있어야 들어갈 수 있다.
// 라우터 도입 전에는 screen state가 항상 'auth'로 시작해 이 문제가 없었지만,
// 라우팅은 URL만으로 매치하므로 세션 없이 새로고침/북마크로 `/app/...`에 바로
// 들어오면 그대로 렌더링돼 버린다 — 실제 브라우저 검증에서 드러난 갭이라 가드를 추가했다.
import { Navigate } from 'react-router-dom'

export default function RequireSession({ session, booting, children }) {
  if (booting) return <div className="page">불러오는 중...</div>
  if (!session) return <Navigate to="/auth" replace />
  return children
}
