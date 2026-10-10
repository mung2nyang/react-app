// @ts-check
// DayRecordLike 타입 정본(타입 전용 모듈). calendarBadges.js/financeTypes.js가 이름을 이어 받는다.
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
 * @property {string} [assignedVehicleNumber] 연동 해제 때 복사된 날의 배정 차량 번호
 */

export {}
