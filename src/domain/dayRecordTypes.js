// @ts-check
// 재감사 3차(FAIL 지적 4번) — day-record.js에 @ts-check를 붙이면서 200줄을
// 넘겨서(239줄) 타입 선언만 이 파일로 뺐다(clientTypes.js/callDetail.js와 같은
// 관례). DayRecordLike의 정본은 여기다 — calendarBadges.js/financeTypes.js가
// alias한다.
/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */

/**
 * @typedef {Object} DayRecordLike
 * @property {boolean} [isOff]
 * @property {number|string} [fixedCount]
 * @property {number|string} [palletCount]
 * @property {Array<CallDetailLike>} [callDetails]
 * @property {Record<string, number>} [fixedRouteCounts]
 * @property {number|string} [fare]
 * @property {number|string} [fixedFare]
 * @property {number|string} [totalFare]
 * @property {number|string} [count]
 */

export {}
