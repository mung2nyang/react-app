// @ts-check
// 재감사 3차(FAIL 지적 4번) — day-record.js에 @ts-check를 붙이면서 200줄을
// 넘겨서(239줄) 타입 선언만 이 파일로 뺐다(clientTypes.js/callDetail.js와 같은
// 관례). DayRecordLike의 정본은 여기다 — calendarBadges.js/financeTypes.js가
// alias한다.
/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */

/**
 * @typedef {Object} DayRecordLike
 * persist 런타임(`isPersistedDayRecord`)과 동일한 계약: 횟수는 음이 아닌 정수,
 * 운임은 `isValidCurrencyAmount`(정수 또는 천단위 쉼표 문자열).
 * @property {boolean} [isOff]
 * @property {number} [fixedCount]
 * @property {number} [palletCount]
 * @property {Array<CallDetailLike>} [callDetails]
 * @property {Record<string, number>} [fixedRouteCounts]
 * @property {number|string} [fare]
 * @property {number|string} [fixedFare]
 * @property {number|string} [totalFare]
 * @property {number} [count]
 * @property {number} [dailyDistance]
 * @property {Array<import('../lib/pendingWorkDataWritesTypes.js').JsonRecord>} [fuelItems]
 * @property {Array<import('../lib/pendingWorkDataWritesTypes.js').JsonRecord>} [maintItems]
 * @property {Array<import('../lib/pendingWorkDataWritesTypes.js').JsonRecord>} [miscItems]
 */

export {}
