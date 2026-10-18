// @ts-check
// 기사 차량 창의 "기사 몫 기준" 드롭다운 — 매출제 % 기사 몫을 운송료 전체 / 거래처 수수료 뗀 뒤 중 어디서 계산할지(로드맵 61).
import AppDropdown from '../shared/AppDropdown.jsx'

const OPTIONS = [
  { value: 'gross', label: '운송료 전체' },
  { value: 'afterClientCommission', label: '거래처 수수료 뗀 뒤' },
]

/**
 * @param {{ value: string|undefined, onChange: (next: 'gross'|'afterClientCommission') => void }} props
 */
export default function CarShareBaseField({ value, onChange }) {
  const current = value === 'afterClientCommission' ? 'afterClientCommission' : 'gross'
  return (
    <div className="form-group car-share-base-field">
      <label htmlFor="newCarShareBase">기사 몫 기준</label>
      <p className="car-settlement-mode-guide">기사 몫(%)을 어느 금액에서 계산할지 고릅니다.</p>
      <AppDropdown
        id="newCarShareBase"
        label="기사 몫 기준"
        value={current}
        options={OPTIONS}
        onChange={(next) => onChange(next === 'afterClientCommission' ? 'afterClientCommission' : 'gross')}
        className="app-dropdown-boxed"
      />
      <p className="car-settlement-mode-guide">예) 운송료 100만원, 거래처 수수료 10만원, 기사 몫 30% → 운송료 전체 30만원 / 거래처 수수료 뗀 뒤 27만원</p>
    </div>
  )
}
