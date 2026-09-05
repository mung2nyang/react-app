import { useMemo, useRef, useState } from 'react'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import { formatWon } from '../lib/money.js'
import { buildMonthReport, buildReportFileName, dash } from '../lib/report.js'
import { useOwnerCars, useOwnerClients, useOwnerExpenses, useOwnerProfile, useOwnerSettings, useOwnerWorkData } from '../store/ownerDataHooks.js'

const YEAR_OPTIONS = getYearOptions()

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function ReportPage({ ownerKey = 'guest', onBack, showToast }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const [savingPdf, setSavingPdf] = useState(false)
  const exportRef = useRef(/** @type {HTMLDivElement|null} */ (null))
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

  async function handleDownloadPdf() {
    const element = exportRef.current
    if (!element || savingPdf) return
    setSavingPdf(true)
    document.body.classList.add('pdf-export-mode')
    try {
      const mod = await import('html2pdf.js')
      const html2pdf = mod.default
      const opt = {
        margin: [12, 10, 12, 10],
        filename: buildReportFileName(year, month),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }
      await html2pdf().set(opt).from(element).save()
      showToast?.('PDF를 저장했습니다.')
    } catch (error) {
      console.error('PDF 저장 실패:', error)
      showToast?.('PDF 저장에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      document.body.classList.remove('pdf-export-mode')
      setSavingPdf(false)
    }
  }

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

      <div className="report-pdf-actions">
        <button type="button" className="theme-toggle-btn" disabled={savingPdf} onClick={handleDownloadPdf}>
          {savingPdf ? 'PDF 저장 중…' : 'PDF 다운로드'}
        </button>
      </div>

      <div id="reportContentToExport" ref={exportRef}>
        <div className="report-title">{report.title}</div>

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
    </div>
  )
}
