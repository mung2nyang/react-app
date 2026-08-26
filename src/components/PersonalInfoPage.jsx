import { useState } from 'react'
import { formatPhoneNumber } from '../lib/formatPhone.js'
import { loadProfile, saveProfile } from '../lib/profile.js'

export default function PersonalInfoPage({ ownerKey = 'guest', session, onBack, onGoAuth, showToast }) {
  const [profile, setProfile] = useState(() => {
    const loaded = loadProfile(ownerKey)
    if (!loaded.name && session?.name && session.name !== '비회원') loaded.name = session.name
    if (!loaded.phone && session?.phone) loaded.phone = session.phone
    return loaded
  })

  function update(field, value) {
    const next = { ...profile, [field]: value }
    setProfile(next)
    saveProfile(ownerKey, next)
  }

  const guest = !!session?.guestMode

  return (
    <div className="page personal-info-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">개인정보</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="personal-intro">
        <span className="personal-intro-kicker">MY PROFILE</span>
        <strong>업무에 필요한 정보를<br />한곳에서 관리하세요.</strong>
        <p>입력하면 바로 저장됩니다. 소속 연결은 나중에 붙입니다.</p>
      </div>

      <div className="personal-card-grid">
        <section className="setting-section personal-card">
          <div className="personal-card-heading">
            <span className="personal-card-icon">01</span>
            <div><h3>사업자 정보</h3><p>내역서에 표시되는 업체 정보</p></div>
          </div>
          <div className="form-group">
            <label htmlFor="bizName">사업자명 (상호)</label>
            <input id="bizName" className="input-box" placeholder="사업자명을 입력하세요" value={profile.bizName} onChange={(e) => update('bizName', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="bizRepresentative">대표자명</label>
            <input id="bizRepresentative" className="input-box" placeholder="대표자명을 입력하세요" value={profile.bizRepresentative} onChange={(e) => update('bizRepresentative', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="bizNumber">사업자 번호</label>
            <input id="bizNumber" className="input-box" placeholder="사업자 번호를 입력하세요" value={profile.bizNumber} onChange={(e) => update('bizNumber', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="bizAddress">사업장 주소</label>
            <input id="bizAddress" className="input-box" placeholder="사업장 주소를 입력하세요" value={profile.bizAddress} onChange={(e) => update('bizAddress', e.target.value)} />
          </div>
          <div className="personal-inline-fields">
            <div className="form-group">
              <label htmlFor="bizType">업태</label>
              <input id="bizType" className="input-box" placeholder="예: 운수업" value={profile.bizType} onChange={(e) => update('bizType', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="bizItem">종목</label>
              <input id="bizItem" className="input-box" placeholder="예: 화물운송" value={profile.bizItem} onChange={(e) => update('bizItem', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="bizEmail">세금계산서 이메일</label>
            <input id="bizEmail" type="email" className="input-box" placeholder="이메일을 입력하세요" value={profile.bizEmail} onChange={(e) => update('bizEmail', e.target.value)} />
          </div>
        </section>

        <section className="setting-section personal-card">
          <div className="personal-card-heading">
            <span className="personal-card-icon">02</span>
            <div><h3>대표자 · 연락처</h3><p>대표자 기본 정보</p></div>
          </div>
          <div className="form-group">
            <label htmlFor="userName">성명 (대표자)</label>
            <input id="userName" className="input-box" placeholder="성명을 입력하세요" value={profile.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="userPhone">연락처</label>
            <input id="userPhone" type="tel" className="input-box" placeholder="010-0000-0000" value={profile.phone} onChange={(e) => update('phone', formatPhoneNumber(e.target.value))} />
          </div>
        </section>

        <section className="setting-section personal-card">
          <div className="personal-card-heading">
            <span className="personal-card-icon">03</span>
            <div><h3>정산 계좌</h3><p>운송료를 입금받을 계좌</p></div>
          </div>
          <div className="form-group">
            <label htmlFor="bankName">입금 은행</label>
            <input id="bankName" className="input-box" placeholder="예: OO은행" value={profile.bankName} onChange={(e) => update('bankName', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="accountNumber">계좌번호</label>
            <input id="accountNumber" className="input-box" inputMode="numeric" placeholder="계좌번호 입력" value={profile.accountNumber} onChange={(e) => update('accountNumber', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="accountHolder">예금주 (계좌 명의)</label>
            <input id="accountHolder" className="input-box" placeholder="예금주명을 입력하세요" value={profile.accountHolder} onChange={(e) => update('accountHolder', e.target.value)} />
          </div>
        </section>

        <section className="setting-section personal-card">
          <div className="personal-card-heading">
            <span className="personal-card-icon">04</span>
            <div><h3>계정</h3><p>로그인 상태</p></div>
          </div>
          <p className="car-type-hint">
            {guest ? '비회원으로 사용 중입니다.' : `${session?.name || '로그인'} 계정으로 사용 중입니다.`}
          </p>
          {guest ? (
            <button type="button" className="personal-account-btn" onClick={onGoAuth}>로그인하러 가기</button>
          ) : (
            <button
              type="button"
              className="personal-account-btn ghost"
              onClick={() => {
                showToast?.('로그아웃했습니다.')
                onGoAuth?.()
              }}
            >
              로그아웃
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
