// @ts-check
// 서류 발급 [일상점검표] 탭(9-C-1, 피그마 "서류 발급" 1번): 달 이동(위 화면이 줌) + 서류 탭 + 8일 구간 탭 + 머리 칸 + 외관·상태·기타 표(O/X/미, 오늘 이후 빈칸).
// 그 달 점검표는 서버에서 한 번에 읽고(보기만), 휴무는 그 차량 일지에서 읽는다. 표 아래 내보내기(법정 서식, 9-D).
import { useEffect, useMemo, useState } from 'react'
import { DAILY_INSPECTION_SECTIONS } from '../../domain/dailyInspectionItems.js'
import { RANGE_LABELS, dateKeyOf, initialRangeIndex, inspectionMark, rangeDays } from '../../domain/dailyInspectionMonth.js'
import { todayKey } from '../../domain/expenses.js'
import { fetchMonthDailyInspections } from '../../lib/dailyInspections.js'
import { vehicleSupabaseIdForLog } from '../../lib/mainDayLogRouting.js'
import { useOwnerCars, useOwnerWorkDataByLogId } from '../../store/ownerDataHooks.js'
import { useOwnerProfile } from '../../store/ownerProfileDriversHooks.js'
import DailyInspectionExportBar from './DailyInspectionExportBar.jsx'
import MonthNavigator from './MonthNavigator.jsx'

/** @typedef {import('../../domain/dailyInspectionMonth.js').MonthInspection} MonthInspection */

/** @param {{ ownerKey: string, logKey: string, viewDate: Date, onChangeMonth: (next: Date) => void, tabs?: import('react').ReactNode, showToast?: (message: string) => void }} props */
export default function DailyInspectionMonthSheet({ ownerKey, logKey, viewDate, onChangeMonth, tabs, showToast }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const [rangeIndex, setRangeIndex] = useState(() => initialRangeIndex(year, month, new Date()))
  const [load, setLoad] = useState(/** @type {{ status: 'loading'|'ready'|'error', byDate: Record<string, MonthInspection> }} */ ({ status: 'loading', byDate: {} }))
  const [reloadTick, setReloadTick] = useState(0)
  const cars = useOwnerCars(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const workData = useOwnerWorkDataByLogId(ownerKey)[logKey] || {}
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, logKey)
  const car = (logKey === 'main' ? (cars.find((item) => item.type === 'main') || cars[0]) : cars.find((item) => item.number === logKey)) || null

  useEffect(() => {
    if (vehicleId == null) return undefined
    let alive = true
    setLoad({ status: 'loading', byDate: {} })
    fetchMonthDailyInspections(vehicleId, year, month)
      .then((byDate) => { if (alive) setLoad({ status: 'ready', byDate }) })
      .catch((error) => {
        console.error('[DailyInspectionMonthSheet] 불러오기 실패:', error)
        if (alive) setLoad({ status: 'error', byDate: {} })
      })
    return () => { alive = false }
  }, [vehicleId, year, month, reloadTick])

  const days = useMemo(() => rangeDays(year, month, rangeIndex), [year, month, rangeIndex])
  const today = todayKey()

  if (vehicleId == null) return null
  const head = {
    bizName: profile.bizRepresentative || '',
    driverName: String(car?.driverName || profile.name || '').trim(),
    carNumber: car?.number || '',
  }

  /** @param {Date} next */
  function changeMonth(next) {
    onChangeMonth(next)
    setRangeIndex(initialRangeIndex(next.getFullYear(), next.getMonth(), new Date()))
  }

  return (
    <div className="doc-inspection-sheet">
      <div className="report-top-card">
        <MonthNavigator viewDate={viewDate} onChange={changeMonth} />
        {tabs}
        <div className="doc-range-tabs" role="tablist" aria-label="날짜 구간">
          {RANGE_LABELS.map((label, index) => (
            <button key={label} type="button" role="tab" aria-selected={rangeIndex === index} className={`doc-range-tab${rangeIndex === index ? ' active' : ''}`} onClick={() => setRangeIndex(index)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <table className="doc-sheet-head">
        <tbody>
          <tr>
            <th>운송사업자명</th><td>{head.bizName || '-'}</td>
            <th>운수종사자명</th><td>{head.driverName || '-'}</td>
          </tr>
          <tr>
            <th>차량번호</th><td colSpan={3}>{head.carNumber || '-'}</td>
          </tr>
        </tbody>
      </table>

      {load.status === 'error' ? (
        <div className="doc-sheet-message">
          <span>일상점검표를 불러오지 못했습니다.</span>
          <button type="button" className="doc-retry-btn" onClick={() => setReloadTick((n) => n + 1)}>다시 시도</button>
        </div>
      ) : load.status === 'loading' ? (
        <div className="doc-sheet-message"><span>불러오는 중입니다.</span></div>
      ) : DAILY_INSPECTION_SECTIONS.map((section) => (
        <table key={section.no} className="doc-sheet-table">
          <thead>
            <tr>
              <th className="doc-sheet-item">{section.title}</th>
              {days.map((day) => <th key={day}>{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {section.items.map((item) => (
              <tr key={item.key}>
                <th className="doc-sheet-item" scope="row">{item.label}</th>
                {days.map((day) => {
                  const dateKey = dateKeyOf(year, month, day)
                  const record = workData[dateKey]
                  const mark = inspectionMark({ dateKey, todayKey: today, isOff: !!record?.isOff, items: load.byDate[dateKey]?.items, itemKey: item.key })
                  return <td key={day} className={`doc-mark${mark === 'X' ? ' bad' : ''}`}>{mark}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      <DailyInspectionExportBar
        form={{ year, month, head, byDate: load.byDate, workData, todayKey: today }}
        ready={load.status === 'ready'}
        showToast={showToast}
      />
    </div>
  )
}
