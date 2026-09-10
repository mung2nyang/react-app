// @ts-check

/**
 * @param {Object} props
 * @param {import('react').ReactNode} props.title
 * @param {() => void} [props.onBack]
 * @param {() => void} [props.onOpenMenu]
 * @param {import('react').ReactNode} [props.titleExtra]
 */
export default function PageHeader({ title, onBack, onOpenMenu, titleExtra }) {
  return (
    <div className="settings-header">
      <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      {titleExtra ? (
        <div className="modal-title-stack">
          <div className="settings-title">{title}</div>
          {titleExtra}
        </div>
      ) : (
        <div className="settings-title">{title}</div>
      )}
      {onOpenMenu ? (
        <button type="button" className="icon-btn top-menu-btn" title="메뉴" onClick={onOpenMenu}>
          <svg viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      ) : (
        <div style={{ width: 40 }}></div>
      )}
    </div>
  )
}
