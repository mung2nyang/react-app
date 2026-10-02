// @ts-check
// 일상점검표 법정 서식(9-D, 별지 제14호의5서식) 한 장 — 내보내기 전용(화면 밖에 그림). 흰 바탕·검은 글씨 고정, 날짜는 1~그 달 끝날(21일 포함).
import { DAILY_INSPECTION_SECTIONS } from '../../domain/dailyInspectionItems.js'
import { actionNoteLines, dateKeyOf, inspectionMark, inspectorCell, legalFormMark, monthDays } from '../../domain/dailyInspectionMonth.js'
import './legal-form.css'

/** @typedef {import('../../domain/dailyInspectionMonth.js').MonthInspection} MonthInspection */

/**
 * @param {Object} props
 * @param {number} props.year
 * @param {number} props.month 0부터
 * @param {{ bizName: string, driverName: string, carNumber: string }} props.head
 * @param {Record<string, MonthInspection>} props.byDate
 * @param {Record<string, { isOff?: boolean }>} props.workData
 * @param {string} props.todayKey
 */
export default function DailyInspectionLegalForm({ year, month, head, byDate, workData, todayKey }) {
  const days = monthDays(year, month)
  const notes = actionNoteLines(byDate)
  /** @param {number} day */
  const dayInfo = (day) => {
    const dateKey = dateKeyOf(year, month, day)
    return { dateKey, isOff: !!workData[dateKey]?.isOff, record: byDate[dateKey] }
  }

  return (
    <div className="legal-form">
      <p className="legal-form-basis">■ 화물자동차 운수사업법 시행규칙 [별지 제14호의5서식]</p>
      <h2 className="legal-form-title">운수종사자 일상점검표</h2>
      <table className="legal-form-head">
        <tbody>
          <tr>
            <th>점검연월</th><td>{year}년 {month + 1}월</td>
            <th>운송사업자명</th><td>{head.bizName}</td>
            <th>차량번호</th><td>{head.carNumber}</td>
            <th>운수종사자명</th><td>{head.driverName}</td>
          </tr>
        </tbody>
      </table>
      <table className="legal-form-table">
        <colgroup>
          <col className="legal-form-col-section" />
          <col className="legal-form-col-item" />
          {days.map((day) => <col key={day} />)}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2} rowSpan={2}>점검항목</th>
            <th colSpan={days.length}>점검결과(양호 ○, 불량 ×, 미운행시 &ldquo;미&rdquo; 기입)</th>
          </tr>
          <tr>{days.map((day) => <th key={day}>{day}</th>)}</tr>
        </thead>
        <tbody>
          {DAILY_INSPECTION_SECTIONS.map((section) => section.items.map((item, index) => (
            <tr key={item.key}>
              {index === 0 && <th rowSpan={section.items.length} className="legal-form-section">{section.title.replace(/\s/g, '').split('').join('\n')}</th>}
              <th className="legal-form-item">{item.label}</th>
              {days.map((day) => {
                const { dateKey, isOff, record } = dayInfo(day)
                return <td key={day}>{legalFormMark(inspectionMark({ dateKey, todayKey, isOff, items: record?.items, itemKey: item.key }))}</td>
              })}
            </tr>
          )))}
          <tr>
            <th colSpan={2}>점검자 확인(서명)</th>
            {days.map((day) => {
              const { dateKey, isOff, record } = dayInfo(day)
              return <td key={day} className="legal-form-sign">{inspectorCell({ dateKey, todayKey, isOff, record })}</td>
            })}
          </tr>
          <tr>
            <th colSpan={2}>불량상태 조치 기록</th>
            <td colSpan={days.length} className="legal-form-notes">
              {notes.map((line) => <div key={line}>{line}</div>)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
