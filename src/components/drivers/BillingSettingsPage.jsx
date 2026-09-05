// @ts-check
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { savePracticeSettings } from '../../lib/practiceSettings.js'
import { useOwnerSettings } from '../../store/ownerDataHooks.js'
import './linked-driver.css'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function BillingSettingsPage({ ownerKey = 'guest', onBack, showToast }) {
  const navigate = useNavigate()
  const practiceSettings = useOwnerSettings(ownerKey)
  const currentBasis = practiceSettings.driverInvoiceBasis === 'gross' ? 'gross' : 'net'
  const [basis, setBasis] = useState(currentBasis)

  useEffect(() => {
    setBasis(practiceSettings.driverInvoiceBasis === 'gross' ? 'gross' : 'net')
  }, [practiceSettings.driverInvoiceBasis])

  /** @param {import('react').ChangeEvent<HTMLSelectElement>} event */
  async function handleChange(event) {
    const nextBasis = event.target.value === 'gross' ? 'gross' : 'net'
    setBasis(nextBasis)
    try {
      await savePracticeSettings(ownerKey, { driverInvoiceBasis: nextBasis })
      showToast?.('정산·계산서 기본 설정을 저장했습니다.')
    } catch {
      showToast?.('정산·계산서 설정 저장에 실패했습니다.')
    }
  }

  function handleBack() {
    if (onBack) onBack()
    else navigate(-1)
  }

  return (
    <div className="page billing-settings-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={handleBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">정산·계산서 설정</div>
        <div style={{ width: 40 }}></div>
      </div>
      <section className="billing-settings-hero">
        <span>BILLING FLOW</span>
        <strong>기사 매입 계산서 발행 기준을 선택하세요.</strong>
        <p>계산서 처리 방식(회사 정산/기사 직접 정산 등)은 기사차량마다 달라질 수 있어, 이제 차량 정보 화면에서 차량별로 직접 설정합니다.</p>
      </section>
      <section className="billing-settings-card">
        <label htmlFor="driverInvoiceBasis">기사 매입 계산서 기준</label>
        <select id="driverInvoiceBasis" className="input-box" value={basis} onChange={handleChange}>
          <option value="net">공제 후 지급액</option>
          <option value="gross">공제 전 운송료</option>
        </select>
        <div id="billingSettingsModeGuide" className="billing-settings-guide">
          {basis === 'gross'
            ? '기사 매입 계산서는 공제 전 운송료를 기준으로 준비합니다.'
            : '기사 매입 계산서는 수수료·산재보험료 공제 후 지급액을 기준으로 준비합니다.'}
        </div>
        <p className="billing-settings-note">세무 처리 기준은 거래 형태에 따라 다를 수 있으므로 실제 발급 전 확인해 주세요.</p>
      </section>
    </div>
  )
}
