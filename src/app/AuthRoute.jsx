// @ts-check
// `/auth` 라우트. 부트 중에는 로딩 표시만 보여 로그인 상태인데 첫 화면이 번쩍이지 않게 한다.
// 세션이 이미 있으면(홈 이동은 BrowserRouter가 startTransition으로 늦게 처리) 넘어갈 때까지 로딩 표시 유지.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthPage from '../components/AuthPage.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'

/** 세션이 있는데 이만큼 지나도 다른 화면으로 안 넘어가면(주소창에 /auth 직접 입력 등) 홈으로. */
export const AUTH_WITH_SESSION_REDIRECT_MS = 1500

/**
 * @param {Object} props
 * @param {boolean} props.booting
 * @param {import('../lib/outboxTypes.js').AppSession|null} [props.session]
 * @param {(message: string) => void} props.showToast
 * @param {() => void} [props.onGuest]
 */
export default function AuthRoute({ booting, session = null, showToast, onGuest }) {
  const navigate = useNavigate()
  const signedIn = !booting && !!session

  useEffect(() => {
    if (!signedIn) return undefined
    const timer = setTimeout(() => navigate('/app', { replace: true }), AUTH_WITH_SESSION_REDIRECT_MS)
    return () => clearTimeout(timer)
  }, [signedIn, navigate])

  if (booting || session) return <LoadingScreen />

  return (
    <div className="container account-flow-container">
      <AuthPage showToast={showToast} onGuest={onGuest} />
    </div>
  )
}
