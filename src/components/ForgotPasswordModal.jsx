// App.jsx에서 분리한 비밀번호 찾기 안내 모달. 계정/인증 흐름 전용이라
// migration-plan.md의 auth/ 화면 이관 시 AuthLayout 쪽으로 옮겨갈 자리다.
export default function ForgotPasswordModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">비밀번호 찾기</div>
        <p style={{ fontSize: '0.95rem', marginBottom: 24, whiteSpace: 'pre-wrap', lineHeight: 1.4, color: 'var(--text-color)' }}>
          {'비밀번호를 분실하셨나요?\n\n소속 기사님의 경우 사장님을 통해 임시 비밀번호를 재발급받으실 수 있습니다.\n기타 문의는 고객센터 1:1 문의를 이용해 주세요.'}
        </p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onClose}>닫기</button>
          <button type="button" className="modal-btn confirm" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  )
}
