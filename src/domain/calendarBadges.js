// @ts-check
// Step 5(달력 홈 재작성) 재감사 3번: 달력 셀 뱃지 계산(dayFareTotal/dayWorkBadgeLabel/
// dayHasUnpaid)과 그 표시 포맷(formatFareShort)을 day-record.js/money.js에서 분리해
// 담는 타입 전용 모듈이다. 두 파일 다 아직 // @ts-check가 없고, checkJs:true로 붙여
// 보면 그 파일들의 선행 타입 부채(암묵적 any 등)가 그대로 드러난다는 걸 실측으로
// 확인했다 — 이 Step에서 새로 만든 로직만 이 파일에 모아서 정확히 타입 체크되게
// 하고, 기존 파일들의 부채 정리(Step 11 몫)로 범위를 넓히지 않는다.
//
// 이 파일이 가져다 쓰는 day-record.js/finance.js/money.js의 함수는 여전히
// untyped지만, TS는 allowJs로 그 파일들도 구조적으로 타입을 추론하므로 이 파일
// 자신의 로직(아래 4개 함수)은 정확하게 검사된다.
import { callFareTotal, dayTripCount, getCallDetails, getFixedCount, isOffDay } from './day-record.js'
import { getDetailPaymentSummary } from './finance.js'
import { parseCurrencyValue } from './money.js'

// Step 6(일지 재작성): CallDetailLike는 이제 domain/callDetail.js 한 곳에서만
// 정의한다 — 여기서 다시 선언했더니 day-log/dayLogTypes.js가 쓰는(필드가 훨씬 많은)
// CallDetailLike와 서로 안 겹쳐서 타입 에러가 났다(실측 확인). 이 alias는 기존에
// `import('./calendarBadges.js').CallDetailLike`로 참조하던 다른 파일들의 경로를
// 안 바꾸려고 남겨 둔다.
/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */
// 재감사 3차 — DayRecordLike의 정본은 dayRecordTypes.js다(필드가 더 많다:
// palletCount/fixedRouteCounts 등). 여기서 다시 선언하지 않고 alias만 한다 —
// 기존에 `import('./calendarBadges.js').DayRecordLike`로 참조하던 다른 파일들의
// 경로를 안 바꾸려고 이 이름은 남겨 둔다.
/** @typedef {import('./dayRecordTypes.js').DayRecordLike} DayRecordLike */

/**
 * 달력 셀 fare 뱃지용 짧은 금액 표기. 바닐라 script.js의 formatFareShort(만원
 * 단위는 "N만", 그보다 작으면 "N원")를 그대로 옮긴다.
 * @param {number} amount
 * @returns {string}
 */
export function formatFareShort(amount) {
  const n = Math.max(0, Number(amount) || 0)
  if (n >= 10000) return `${Math.round(n / 10000)}만`
  return `${n.toLocaleString('ko-KR')}원`
}

/**
 * 하루치 "운송료 표시" 금액 — inputMode==='fare'일 때 셀 뱃지에 쓴다.
 * 바닐라 script.js(buildCalendar)는 이 금액을 고정노선에 연결된 거래처의
 * fixedUnitPrice로 계산한다(설정 화면의 별도 "1회 단가" 필드가 바닐라엔 아예 없다).
 * 이 react-app 포트는 아직 거래처 연동(Step 7의 fixedRouteLinked/fixedUnitPrice) 이전이라,
 * 대신 설정 스토어의 독립적인 unitPrice("1회 단가" 입력)를 그대로 쓴다 — 두 소스를
 * 하나로 합치는 작업은 의도적으로 지금 하지 않는다(migration-audit-plan.md Step 5:
 * "고정노선 단가와 달력 합계 소스를 문서화(통일은 Step 6과 함께)"). Step 7에서 거래처의
 * fixedUnitPrice가 들어오면 이 함수가 그 값과 어떻게 합쳐질지 다시 정해야 한다.
 * @param {DayRecordLike|null|undefined} record
 * @param {number|string} unitPrice
 * @returns {number}
 */
export function dayFareTotal(record, unitPrice) {
  const unit = Math.max(0, parseCurrencyValue(unitPrice))
  return getFixedCount(record) * unit + callFareTotal(record)
}

/**
 * count 모드는 "N회", fare 모드는 짧은 금액 표기 — 바닐라의 표시 분기(displayMode)를
 * 그대로 옮긴다. 휴무거나 표시할 값이 전혀 없으면 null(뱃지 숨김).
 * @param {DayRecordLike|null|undefined} record
 * @param {{ inputMode?: 'count'|'fare', unitPrice?: number|string }} [options]
 * @returns {string|null}
 */
export function dayWorkBadgeLabel(record, { inputMode = 'count', unitPrice = 0 } = {}) {
  if (isOffDay(record)) return null
  const trips = dayTripCount(record)
  const fare = dayFareTotal(record, unitPrice)
  if (trips <= 0 && fare <= 0) return null
  return inputMode === 'fare' ? formatFareShort(fare) : `${trips}회`
}

/**
 * 하루에 미수(완납 아님) 콜상세가 하나라도 있는지. 바닐라와 동일하게 isOff 여부와
 * 무관하게 callDetails를 그대로 검사한다(휴무로 표시를 바꿔도 남아있는 콜상세 기록의
 * 미수 여부는 별개다). paymentOn이 꺼져 있으면 항상 false — 결제 기능 자체를 안 쓰는
 * 계정에는 점을 표시하지 않는다.
 * @param {DayRecordLike|null|undefined} record
 * @param {boolean} paymentOn
 * @returns {boolean}
 */
export function dayHasUnpaid(record, paymentOn) {
  if (!paymentOn) return false
  return getCallDetails(record).some(
    (/** @type {CallDetailLike} */ detail) => getDetailPaymentSummary(detail).status !== 'paid',
  )
}
