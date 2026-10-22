// @ts-check
// 연동 기사가 계약기간 밖 날짜 일지를 열면 입력칸 대신 안내 — 문장은 domain/drivers.ts assignmentPeriodNotice.
import PageHeader from '../../../shared/ui/PageHeader.jsx'

/**
 * @param {{ title: string, notice: { title: string, body: string }, onBack?: () => void, onOpenMenu?: () => void }} props
 */
export default function AssignmentPeriodPage({ title, notice, onBack, onOpenMenu }) {
  return (
    <div className="page work-log-page">
      <PageHeader title={title} onBack={onBack} onOpenMenu={onOpenMenu} />
      <div className="empty-state assignment-period-notice" role="status">
        <p>{notice.title}</p>
        <p>{notice.body}</p>
      </div>
    </div>
  )
}
