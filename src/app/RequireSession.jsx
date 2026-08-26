// Step 3 라우터 셸: `/onboarding`, `/app/*`는 세션이 있어야 들어갈 수 있다.
// 라우터 도입 전에는 screen state가 항상 'auth'로 시작해 이 문제가 없었지만,
// 라우팅은 URL만으로 매치하므로 세션 없이 새로고침/북마크로 `/app/...`에 바로
// 들어오면 그대로 렌더링돼 버린다 — 실제 브라우저 검증에서 드러난 갭이라 가드를 추가했다.
//
// 판단 자체는 resolveSessionGate(sessionGate.js)의 순수 함수로 빼 뒀다 — 여기는 그
// 결과를 렌더로 옮기기만 한다(Step 0-4 감사 보완 — 비로그인 딥링크 테스트가 그 함수를 쓴다).
import { Navigate } from 'react-router-dom'
import { resolveSessionGate } from './sessionGate.js'

export default function RequireSession({ session, booting, children }) {
  const gate = resolveSessionGate({ booting, session })
  if (gate === 'loading') return <div className="page">불러오는 중...</div>
  if (gate === 'redirect') return <Navigate to="/auth" replace />
  return children
}
