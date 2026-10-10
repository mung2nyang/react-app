// @ts-check
// 콜상세 한 건의 모양 정본(타입만, 런타임 코드 없음) — 따로 선언하면 서로 안 맞아 타입 오류가 난다.
/**
 * payments.js/financeCore.js가 실제로 보존·계산하는 값 그대로: id는 아예 없는 레거시 항목이 실존하고(day-record.js/backfillCallDetailIds는
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
 * @property {string|number} [insuranceFee]
 */

export {}
