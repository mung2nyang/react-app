// @ts-check
// 재감사 3차(FAIL 지적 4번) — finance*.js 5개 파일 전체를 활성 typecheck 대상으로
// 만들면서 반복되는 매개변수 모양을 한 곳에 모은 타입 전용 모듈(export {},
// callDetail.js/dayLogTypes.js와 같은 관례). cars.js/drivers.js는 아직 @ts-check가
// 없어서(이번 diff가 손대지 않은 기존 파일) 그 함수들의 매개변수를 여기서 명시적으로
// 좁혀 준다 — 안 그러면 `link = null` 같은 기본값만으로 TS가 매개변수를 "null만
// 되는 타입"으로 추론해 버린다(Step 5 typedWorkLogPage.js에서 겪은 것과 같은 함정).
/** @typedef {import('./day-record.js').DayRecordLike} DayRecordLike */
/** @typedef {Record<string, Record<string, DayRecordLike>>} WorkDataByLogId logId(차량번호|'main') → 날짜 → 기록 */

/**
 * @typedef {Object} CarLike
 * @property {string} [id]
 * @property {string} number
 * @property {'main'|'sub'} [type]
 * @property {string} [settlementMode]
 * @property {boolean} [commEnabled]
 * @property {string} [commType]
 * @property {string|number} [commission]
 * @property {boolean} [insuranceOn]
 * @property {boolean} [shareRevenueWithOwner]
 * @property {string} [driverName]
 * @property {string} [driverLinkId]
 * @property {{ driverName?: string, bizNumber?: string, name?: string, address?: string, bizType?: string, bizItem?: string, email?: string }} [personalInfo]
 */

/**
 * @typedef {Object} DriverLinkLike
 * @property {string} [id]
 * @property {string} [vehicleNumber]
 * @property {string} [assignmentStart]
 * @property {string} [assignmentEnd]
 * @property {string} [status]
 */

/**
 * finance*.js 함수들이 공유하는 설정 모양 — lib/ownerFinance.js의 buildFinanceSettings가
 * 실제로 만드는 값의 상위집합(느슨하게, 전부 optional로 — 픽스처/실제 값 둘 다
 * 이 함수들에 그대로 들어온다).
 * @typedef {Object} FinanceSettings
 * @property {Array<CarLike>} [cars]
 * @property {Array<import('./clients.js').ClientLike>} [clients]
 * @property {Array<DriverLinkLike>} [driverLinks]
 * @property {boolean} [paymentOn]
 * @property {boolean} [subPaymentOn]
 * @property {boolean} [fixedOn]
 * @property {boolean} [subFixedOn]
 * @property {string} [defaultDriverSettlementMode]
 * @property {string} [driverInvoiceBasis]
 * @property {number|string} [unitPrice]
 * @property {string} [bizName]
 * @property {string} [bizNumber]
 * @property {string} [bizRepresentative]
 * @property {string} [userName]
 * @property {string} [bizAddress]
 * @property {string} [bizType]
 * @property {string} [bizItem]
 * @property {string} [bizEmail]
 */

export {}
