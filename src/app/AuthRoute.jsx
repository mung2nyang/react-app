// Step 3 라우터 셸: `/auth` 라우트. 부트 중에는 AuthPage 대신 로딩 문구만 보여줘
// 로그인 세션이 있는데도 잠깐 로그인 폼이 번쩍이는 것을 막는다(App.jsx의 옛 booting 게이트).
import AuthPage from '../components/AuthPage.jsx'

export default function AuthRoute({ booting, showToast, onGuest, onLogin, onSignup, onForgotPassword }) {
  if (booting) {
    return (
      <div className="container account-flow-container">
        <div className="page">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="container account-flow-container">
      <AuthPage
        showToast={showToast}
        onGuest={onGuest}
        onLogin={onLogin}
        onSignup={onSignup}
        onForgotPassword={onForgotPassword}
      />
    </div>
  )
}
