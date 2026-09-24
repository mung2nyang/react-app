// @ts-check
// 기사 관리 화면 하단 카드 — 기사차량별 사업자정보(세금계산서 공급자)·정산 계좌 입력(이관 감사 11-5·11-6).
import { useState } from 'react'
import { carToBusinessForm } from '../../domain/carBusinessInfo.js'
import { requestCarBusinessInfoSave } from '../../lib/vehicleMutations.js'
import { getCloudUserId } from '../../lib/cloudSession.js'
import './car-business-info.css'

/** @typedef {import('../../domain/carBusinessInfo.js').CarBusinessForm} CarBusinessForm */

/**
 * @param {Object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.inputMode]
 */
function Field({ id, label, value, onChange, inputMode }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input-box"
        inputMode={/** @type {'text'|'numeric'|undefined} */ (inputMode)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {import('../../domain/financeTypes.js').CarLike} props.car 서브(기사) 차량
 * @param {Array<import('../../domain/financeTypes.js').CarLike>} props.cars
 * @param {{ bizName?: string, bizNumber?: string, bankName?: string, accountNumber?: string, accountHolder?: string }} props.profile 차주 사업자·계좌(동일 스위치 켜짐 때 표시용)
 * @param {(message: string) => void} [props.showToast]
 */
export default function CarBusinessInfoSection({ ownerKey, car, cars, profile, showToast }) {
  const [form, setForm] = useState(() => carToBusinessForm(car))
  const [saving, setSaving] = useState(false)
  /** @param {keyof CarBusinessForm} key @param {string} value */
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const bind = (/** @type {'name'|'bizNumber'|'representative'|'address'|'bizType'|'bizItem'|'email'|'bank'|'account'|'accountHolder'} */ key) => ({
    value: form[key],
    onChange: (/** @type {string} */ value) => set(key, value),
  })
  const ownerLine = [profile.bizName, profile.bizNumber].filter(Boolean).join(' · ')
  const ownerAccountLine = [profile.bankName, profile.accountNumber, profile.accountHolder].filter(Boolean).join(' · ')

  async function save() {
    if (saving || !car.id) return
    setSaving(true)
    try {
      const result = await requestCarBusinessInfoSave({ ownerKey, userId: getCloudUserId(), cars, carId: car.id, form })
      if (result.toast) showToast?.(result.toast)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="car-biz-card">
      <h3>사업자·정산 계좌 정보</h3>
      <div className="car-biz-toggle">
        <div>
          <label htmlFor="carBizSameAsOwner">내 사업자 정보와 동일</label>
          <p>{form.sameAsOwner ? '세금계산서와 정산 계좌 모두 내 사업자 기준입니다.' : '이 차량 운행분은 아래 사업자와 그 명의 계좌로 따로 처리합니다.'}</p>
        </div>
        <label className="switch">
          <input
            id="carBizSameAsOwner"
            type="checkbox"
            checked={form.sameAsOwner}
            onChange={(e) => setForm((prev) => ({ ...prev, sameAsOwner: e.target.checked }))}
          />
          <span className="slider"></span>
        </label>
      </div>
      {form.sameAsOwner ? (
        <>
          <p className="car-biz-owner-line">
            {ownerLine || '마이페이지 개인정보에 사업자정보를 먼저 입력해 주세요.'}
          </p>
          <p className="car-biz-owner-line">
            {ownerAccountLine || '마이페이지 개인정보에 정산 계좌를 먼저 입력해 주세요.'}
          </p>
        </>
      ) : (
        <>
          <div className="personal-inline-fields">
            <Field id="carBizName" label="상호" {...bind('name')} />
            <Field id="carBizNumber" label="사업자등록번호" inputMode="numeric" {...bind('bizNumber')} />
          </div>
          <div className="personal-inline-fields">
            <Field id="carBizRepresentative" label="대표자" {...bind('representative')} />
            <Field id="carBizEmail" label="이메일" {...bind('email')} />
          </div>
          <Field id="carBizAddress" label="사업장 주소" {...bind('address')} />
          <div className="personal-inline-fields">
            <Field id="carBizType" label="업태" {...bind('bizType')} />
            <Field id="carBizItem" label="종목" {...bind('bizItem')} />
          </div>
          <div className="personal-inline-fields">
            <Field id="carBankName" label="은행" {...bind('bank')} />
            <Field id="carAccountHolder" label="예금주" {...bind('accountHolder')} />
          </div>
          <Field id="carAccountNumber" label="계좌번호" inputMode="numeric" {...bind('account')} />
        </>
      )}
      <button type="button" className="car-biz-save" disabled={saving} onClick={save}>저장</button>
    </section>
  )
}
