import { useState } from 'react'

const BANNER = '/images/banner_image.png'
const STEP_SEQUENCE = [1, 2, 3, 4]

// accountType prop은 App.jsx가 아직 넘기지만 9-A에서 분기 제거 — 시퀀스는 항상 STEP_SEQUENCE.
export default function OnboardingPage({ accountType: _accountType, onFinish }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [wizard, setWizard] = useState({
    workStyle: null,
    paymentOn: null,
    timeOn: false,
    cargoTonnageOn: false,
    platformOn: false,
    distanceOn: false,
    carNumber: '',
    carTonnage: '',
  })

  const step = STEP_SEQUENCE[stepIndex]
  const isLast = stepIndex === STEP_SEQUENCE.length - 1

  let nextDisabled = false
  if (step === 1) nextDisabled = !wizard.workStyle
  else if (step === 2) nextDisabled = wizard.paymentOn === null
  else if (step === 4) nextDisabled = wizard.carNumber.trim().length < 2

  function goNext() {
    if (isLast) onFinish(wizard)
    else setStepIndex(stepIndex + 1)
  }

  return (
    <div className="account-flow-page">
      <div className="onboarding-shell">
        <div className="auth-topbar">
          {stepIndex > 0 ? (
            <button type="button" className="auth-back-icon-btn" onClick={() => setStepIndex(stepIndex - 1)} aria-label="이전 단계">
              <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
          ) : (
            <span />
          )}
          <div className="onboarding-brand-head">
            <img src={BANNER} alt="" className="onboarding-logo-img" />
            <span className="onboarding-logo-text">운행 일지</span>
          </div>
        </div>

        {step === 1 && (
          <div className="onboarding-step-view">
            <div className="onboarding-heading">
              <h1>주로 어떤 방식으로<br />일하시나요?</h1>
              <p>선택 사항이에요.<br />이 항목들은 나중에 설정 화면에서 언제든 켜고 끌 수 있어요.</p>
            </div>
            <div className="onboarding-options-list">
              <button type="button" className={`onboarding-card-btn${wizard.workStyle === 'fixed' ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, workStyle: 'fixed' })}>정해진 노선을 반복해서 다녀요</button>
              <button type="button" className={`onboarding-card-btn${wizard.workStyle === 'call' ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, workStyle: 'call' })}>그때그때 다른 화물을 배차받아요</button>
              <button type="button" className={`onboarding-card-btn${wizard.workStyle === 'both' ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, workStyle: 'both' })}>둘 다 섞어서 해요</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step-view">
            <div className="onboarding-heading">
              <h1>수금 관리까지<br />하시겠어요?</h1>
              <p>선택 사항이에요.<br />나중에 설정 화면에서 언제든 바꿀 수 있어요.</p>
            </div>
            <div className="onboarding-options-list">
              <button type="button" className={`onboarding-card-btn${wizard.paymentOn === true ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, paymentOn: true })}>네, 입금 안 된 것까지 챙기고 싶어요</button>
              <button type="button" className={`onboarding-card-btn${wizard.paymentOn === false ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, paymentOn: false })}>아니요, 기록만 남길게요</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step-view">
            <div className="onboarding-heading">
              <h1>필요한 기록 항목을<br />선택해 주세요</h1>
              <p>선택 사항이에요.<br />건너뛰어도 괜찮아요.</p>
            </div>
            <div className="onboarding-options-list">
              <button type="button" className={`onboarding-card-btn${wizard.timeOn ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, timeOn: !wizard.timeOn })}>운행 시간도 기록할래요</button>
              <button type="button" className={`onboarding-card-btn${wizard.cargoTonnageOn ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, cargoTonnageOn: !wizard.cargoTonnageOn })}>화물 톤수도 기록할래요</button>
              <button type="button" className={`onboarding-card-btn${wizard.platformOn ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, platformOn: !wizard.platformOn })}>배차 플랫폼(콜앱 등)도 기록할래요</button>
              <button type="button" className={`onboarding-card-btn${wizard.distanceOn ? ' active' : ''}`} onClick={() => setWizard({ ...wizard, distanceOn: !wizard.distanceOn })}>계기판 거리도 기록할래요</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-step-view">
            <div className="onboarding-heading">
              <h1>차량 정보를<br />등록해 주세요</h1>
              <p>차량번호를 등록하면 운행 일지와 정산에 자동으로 연결돼요.</p>
            </div>
            <div className="onboarding-section-title">차량 등록</div>
            <div className="onboarding-form-fields">
              <div className="auth-field">
                <label htmlFor="onboardingCarNumber">차량번호</label>
                <input
                  id="onboardingCarNumber"
                  className="auth-input-box"
                  placeholder="12가 3456"
                  value={wizard.carNumber}
                  onChange={(e) => setWizard({ ...wizard, carNumber: e.target.value })}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="onboardingCarTonnage">차량 톤수</label>
                <input
                  id="onboardingCarTonnage"
                  className="auth-input-box"
                  placeholder="예: 5톤, 11톤, 25톤"
                  value={wizard.carTonnage}
                  onChange={(e) => setWizard({ ...wizard, carTonnage: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        <div className="onboarding-bottom-group">
          <button type="button" className="onboarding-skip-link" onClick={goNext}>건너뛰기 &gt;</button>
          <div className="onboarding-step-counter">{stepIndex + 1}/{STEP_SEQUENCE.length}</div>
          <button type="button" className="onboarding-btn-primary" disabled={nextDisabled} onClick={goNext}>
            {isLast ? '완료하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  )
}
