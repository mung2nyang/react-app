// @ts-check
import PageHeader from './PageHeader.jsx'

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {() => void} props.onBack
 */
export default function ComingSoonPage({ title, onBack }) {
  return (
    <div className="page coming-soon-page">
      <PageHeader title={title} onBack={onBack} />
      <p className="empty-state">이 화면은 다음에 옮깁니다.</p>
    </div>
  )
}
