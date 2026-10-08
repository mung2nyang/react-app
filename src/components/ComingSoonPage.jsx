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
      <p className="empty-state">준비 중인 화면입니다.</p>
    </div>
  )
}
