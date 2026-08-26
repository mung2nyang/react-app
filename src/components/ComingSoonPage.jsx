export default function ComingSoonPage({ title, onBack }) {
  return (
    <div className="page coming-soon-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">{title}</div>
        <div style={{ width: 40 }}></div>
      </div>
      <p className="empty-state">이 화면은 다음에 옮깁니다.</p>
    </div>
  )
}
