// @ts-check
// 콜 상세 출발·마감 계기판 칸과 운행거리. 마감이 출발보다 작으면 마감 칸에 표시만 하고 저장은 막지 않는다.
import { computeDistanceKm } from '../../lib/workData.js'
import CurrencyInput from '../../shared/ui/CurrencyInput.jsx'
import FieldError, { invalidProps } from '../../shared/ui/FieldError.jsx'

/** @typedef {typeof import('./callDetailFormHelpers.js').emptyDraft} CallDetailDraft 폼 입력 중 초안(CallDetailForm 상태와 같은 모양) */

/**
 * @param {Object} props
 * @param {CallDetailDraft} props.draft
 * @param {(next: CallDetailDraft) => void} props.setDraft
 */
export default function CallOdometerFields({ draft, setDraft }) {
  const distancePreview = computeDistanceKm(draft.startOdometer, draft.endOdometer)
  const problem = draft.startOdometer && draft.endOdometer && !distancePreview
    ? { field: 'endOdometer', message: '마감 계기판이 출발 계기판보다 작습니다.' }
    : null
  return (
    <div className="call-detail-panel call-two-column-panel">
      <div className="form-group">
        <label htmlFor="callStartOdometer">출발 계기판</label>
        <div className="input-with-suffix">
          <CurrencyInput id="callStartOdometer" className="input-box" placeholder="출발 계기판" value={draft.startOdometer} onValueChange={(startOdometer) => setDraft({ ...draft, startOdometer })} />
          <span className="suffix">km</span>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="callEndOdometer">마감 계기판</label>
        <div className="input-with-suffix">
          <CurrencyInput id="callEndOdometer" className="input-box" placeholder="마감 계기판" value={draft.endOdometer} onValueChange={(endOdometer) => setDraft({ ...draft, endOdometer })} {...invalidProps(problem, 'endOdometer', 'callEndOdometer')} />
          <span className="suffix">km</span>
        </div>
        <FieldError problem={problem} field="endOdometer" inputId="callEndOdometer" />
      </div>
      {distancePreview && <p className="billing-settings-note">운행거리 {distancePreview}km</p>}
    </div>
  )
}
