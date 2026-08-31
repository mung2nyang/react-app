import { useMemo, useState } from 'react'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import { formatWon } from '../lib/money.js'
import { buildMonthReport, dash } from '../lib/report.js'
import { useOwnerCars, useOwnerClients, useOwnerExpenses, useOwnerProfile, useOwnerSettings, useOwnerWorkData } from '../store/ownerDataHooks.js'

const YEAR_OPTIONS = getYearOptions()

export default function ReportPage({ ownerKey = 'guest', onBack }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const expenses = useOwnerExpenses(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const workData = useOwnerWorkData(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const storedProfile = useOwnerProfile(ownerKey)
  const report = useMemo(
    () => buildMonthReport(ownerKey, year, month, expenses, cars, practiceSettings, workData, clients, storedProfile),
    [ownerKey, year, month, expenses, cars, practiceSettings, workData, clients, storedProfile],
  )
  const car = report.mainCar
  const profile = report.profile

  return (
    <div className="page report-page-wrap">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">운송비 내역서</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="maint-fuel-nav">
        <div className="date-navigator">
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => setViewDate((d) => shiftMonth(d, -1))}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="date-select-group">
            <select className="date-select" value={year} onChange={(e) => setViewDate(setYearMonth(viewDate, Number(e.target.value), month))}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="date-select" value={month} onChange={(e) => setViewDate(setYearMonth(viewDate, year, Number(e.target.value)))}>
              {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{m + 1}월</option>)}
            </select>
          </div>
          <button type="button" className="arrow-btn" title="다음 달" onClick={() => setViewDate((d) => shiftMonth(d, 1))}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      <div className="report-title">{report.title}</div>
      <p className="car-type-hint">달력 횟수·단가·개인정보·차량·정비/주유 기록을 모은 미리보기입니다. PDF 저장은 나중에 붙입니다.</p>

      <table className="info-table">
        <tbody>
          <tr>
            <th>성명</th>
            <td>{dash(profile.name)}</td>
            <th>연락처</th>
            <td>{dash(profile.phone)}</td>
          </tr>
          <tr>
            <th>차량번호</th>
            <td>{dash(car?.number)}</td>
            <th>차량톤수</th>
            <td>{dash(car?.tonnage)}</td>
          </tr>
          <tr>
            <th>입금은행</th>
            <td>{dash(profile.bankName)}</td>
            <th>계좌번호</th>
            <td>{dash(profile.accountNumber)}</td>
          </tr>
          <tr>
            <th>예금주</th>
            <td colSpan={3}>{dash(profile.accountHolder)}</td>
          </tr>
        </tbody>
      </table>

      <div className="summary-card">
        <div className="summary-title">
          <span>월간 운송료 정산</span>
          <span>횟수 {report.trips}회 · 세부 입력 {report.callTrips || 0}건</span>
        </div>
        <div className="summary-row">
          <span>1회 단가</span>
          <span className="summary-value">{formatWon(report.unitPrice)}</span>
        </div>
        <div className="summary-row">
          <span>기본 운송료</span>
          <span className="summary-value">{formatWon(report.fare)}</span>
        </div>
        <div className="summary-row">
          <span>부가세 (공급가액 기준 10%)</span>
          <span className="summary-value">{formatWon(report.vat)}</span>
        </div>
        <div className="summary-row total">
          <span>계</span>
          <span className="summary-value">{formatWon(report.total)}</span>
        </div>
        <div className="summary-row">
          <span>차량 정비비</span>
          <span className="summary-value">{formatWon(report.maint)}</span>
        </div>
        <div className="summary-row">
          <span>차량 주유비</span>
          <span className="summary-value">{formatWon(report.fuel)}</span>
        </div>
        <div className="summary-row">
          <span>통행료/기타</span>
          <span className="summary-value">{formatWon(report.misc)}</span>
        </div>
      </div>
    </div>
  )
}
