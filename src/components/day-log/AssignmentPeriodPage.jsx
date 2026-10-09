// @ts-check
// 로드맵 26: 연동 기사가 배정 기간 밖 날짜 일지를 열면 입력칸 대신 안내 — 서버가 기간 밖 기록을 거절함(DB 0010).
import PageHeader from '../PageHeader.jsx'

/** 'YYYY-MM-DD' → '10월 1일'(해가 다르면 '2025년 10월 1일') @param {string} dateKey @param {string} baseKey */
function dayLabel(dateKey, baseKey) {
  const [y, m, d] = dateKey.split('-')
  const md = `${Number(m)}월 ${Number(d)}일`
  return y === baseKey.slice(0, 4) ? md : `${y}년 ${md}`
}

/**
 * @param {string} dateKey 연 날짜
 * @param {string|null|undefined} start 배정 시작일
 * @param {string|null|undefined} end 배정 종료일
 * @returns {{ title: string, body: string } | null} 기간 안이면 null
 */
export function assignmentPeriodNotice(dateKey, start, end) {
  if (start && dateKey < start) return { title: '배정 기간 전 날짜입니다.', body: `${dayLabel(start, dateKey)}부터 기록할 수 있습니다.` }
  if (end && dateKey > end) return { title: '배정 기간이 끝난 날짜입니다.', body: `${dayLabel(end, dateKey)}까지 기록할 수 있습니다.` }
  return null
}

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
