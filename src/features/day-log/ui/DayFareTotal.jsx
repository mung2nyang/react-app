// @ts-check
// 일지 제목 아래 하루 운송료 합계 — 달력 칸·홈과 같은 계산(고정 노선 + 파렛트 + 세부 운송료).
import { dayFareTotal } from '../../../domain/calendarBadges.ts'
import { formatWon, parseCurrencyValue } from '../../../domain/money.ts'

/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */

/**
 * @param {Object} props
 * @param {import('../../../domain/dayRecordTypes.ts').DayRecordLike} props.draft
 * @param {ClientLike|null} props.fixedRouteClient
 * @param {boolean} props.palletOn 고정 노선 켜짐 + 거래처 파렛트 켜짐
 */
export default function DayFareTotal({ draft, fixedRouteClient, palletOn }) {
  const palletPrice = palletOn ? parseCurrencyValue(fixedRouteClient?.palletPrice) : 0
  const amount = draft.isOff ? 0 : dayFareTotal(draft, fixedRouteClient?.fixedUnitPrice ?? 0, palletPrice)
  // 0원·휴무면 글만 빼고 한 줄 자리는 남긴다 — 아래 칸이 밀리지 않게.
  return (
    <p className="day-fare-total">
      {amount > 0 && <>운송료 합계 <strong>{formatWon(amount)}</strong></>}
    </p>
  )
}
