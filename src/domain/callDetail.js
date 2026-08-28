// @ts-check
// Step 6(일지 재작성): 콜상세 한 건의 모양을 domain 레벨에서 한 곳에만 정의한다.
// Step 5의 domain/calendarBadges.js(달력 셀 뱃지, fare만 필요)와 Step 6의
// day-log/dayLogTypes.js(일지 폼, 필드 전체가 필요)가 각자 다른 CallDetailLike를
// 따로 선언했더니 서로 안 겹쳐서 타입 에러가 났다(실측 확인) — 여기 하나로 합치고
// 양쪽이 이 파일을 참조하게 한다. 런타임 코드는 없다(outboxTypes.js와 같은 관례).
/**
 * 재감사 10차(FAIL 지적 1번, P0) — payments.js/financeCore.js가 실제로 보존·계산하는
 * 값 그대로: id는 아예 없는 레거시 항목이 실존하고(day-record.js/backfillCallDetailIds는
 * 콜상세 자신의 id만 채우지 중첩된 payments[] 항목의 id는 손대지 않는다), amount는
 * parseCurrencyValue(financeCore.js)가 문자열/숫자 둘 다 받는다 — 전부 optional.
 * callDetailSchema.js의 런타임 검증도, financeReceivables.js의 소비 측도 이 정본을
 * 그대로 참조한다(중복 선언으로 인한 스키마 드리프트 방지).
 * @typedef {Object} PaymentLike
 * @property {string} [id]
 * @property {string|number} [amount]
 * @property {string} [paidAt]
 * @property {string} [note]
 */

/**
 * @typedef {Object} CallDetailLike
 * @property {string} [id]
 * @property {string} [loadLoc]
 * @property {string} [unloadLoc]
 * @property {string|number} [fare]
 * @property {string} [client]
 * @property {string|null} [clientId]
 * @property {{ enabled: boolean, type: string|null, value: string|number|null }} [commissionSnapshot]
 * @property {string} [remarks]
 * @property {boolean} [vatExempt]
 * @property {string} [paymentStatus]
 * @property {Array<PaymentLike>} [payments]
 * @property {string} [paymentDueDate]
 * @property {string} [workDate]
 * @property {string} [distanceType]
 * @property {string} [linkedLoadIndex]
 * @property {string} [departureTime]
 * @property {string} [arrivalTime]
 * @property {string} [platform]
 * @property {string|number} [cargoTonnage]
 * @property {string} [receipt]
 * @property {string} [startOdometer]
 * @property {string} [endOdometer]
 * @property {string} [distanceKm]
 */

export {}
