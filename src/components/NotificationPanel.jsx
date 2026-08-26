export default function NotificationPanel({ open, items, onClose, onOpenItem, onDismiss }) {
  if (!open) return null

  return (
    <>
      <div className="notification-panel-overlay" onClick={onClose}></div>
      <aside className="notification-panel" aria-label="알림">
        <div className="notification-panel-header">
          <div>
            <h2>알림</h2>
            <p>확인이 필요한 알림 내역입니다.</p>
          </div>
          <button type="button" className="icon-btn" title="알림 닫기" onClick={onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="notification-panel-list">
          {items.length === 0 && <div className="empty-state">새로운 알림이 없습니다.</div>}
          {items.map((item) => (
            <div key={item.id} className="notification-card">
              <button type="button" className="notification-card-copy" onClick={() => onOpenItem(item)}>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </button>
              <button type="button" className="action-icon-btn del" onClick={() => onDismiss(item.id)}>닫기</button>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
