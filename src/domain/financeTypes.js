// @ts-check
// finance*.js가 함께 쓰는 매개변수 모양 모음(타입 전용 모듈). `link = null` 같은 기본값만 있으면
// TS가 null만 되는 타입으로 좁히므로 여기서 모양을 밝혀 둔다.
/** @typedef {import('./day-record.js').DayRecordLike} DayRecordLike */
/** @typedef {Record<string, Record<string, DayRecordLike>>} WorkDataByLogId logId(차량번호|'main') → 날짜 → 기록 */

/**
 * @typedef {Object} CarLike
 * @property {string} [id]
 * @property {string|number} [supabaseId]
 * @property {string} number
 * @property {string} [tonnage]
 * @property {'main'|'sub'} [type]
 * @property {boolean} [commEnabled]
 * @property {string} [commType]
 * @property {string|number} [commission]
 * @property {boolean} [insuranceOn] 산재보험료 기사 몫(50%) 차감 여부(driverIncomeDeductions.js)
 * @property {'employee'|'business'} [driverIncomeType] 기사 유형: 4대보험 근로자 / 3.3% 사업소득자
 * @property {boolean} [withholdingOn] 3.3% 사업소득세 원천징수 여부
 * @property {string|number} [expenseRate] 산재 월보수액 계산용 필요경비율(%)
 * @property {string|number} [insuranceRate] 산재보험료율(%), 0이면 산재 적용 제외
 * @property {boolean} [logEnabled]
 * @property {boolean} [driverLinkEnabled]
 * @property {boolean} [shareRevenueWithOwner]
 * @property {boolean} [archived]
 * @property {string} [driverName]
 * @property {string} [driverPhone]
 * @property {string} [driverLinkId]
 * @property {string} [driverPayMode]
 * @property {string|number} [driverSalaryAmount]
 * @property {string} [infoType]
 * @property {{ driverName?: string, bizNumber?: string, name?: string, address?: string, bizType?: string, bizItem?: string, email?: string, phone?: string, bank?: string, account?: string, accountHolder?: string }} [personalInfo]
 * @property {{ sameAsOwner?: boolean, name?: string, bizNumber?: string, representative?: string, address?: string, bizType?: string, bizItem?: string, email?: string }} [businessInfo]
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
 * @typedef {Object} SupplierBiz
 * @property {boolean} [sameAsOwner]
 * @property {string} [name]
 * @property {string} [bizNumber]
 * @property {string} [representative]
 * @property {string} [address]
 * @property {string} [bizType]
 * @property {string} [bizItem]
 * @property {string} [email]
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
 * @property {number|string} [unitPrice]
 * @property {string} [bizName]
 * @property {string} [bizNumber]
 * @property {string} [bizRepresentative]
 * @property {string} [userName]
 * @property {string} [bizAddress]
 * @property {string} [bizType]
 * @property {string} [bizItem]
 * @property {string} [bizEmail]
 * @property {'light'|'dark'} [theme]
 * @property {'count'|'fare'} [inputMode]
 * @property {boolean} [callDetail]
 * @property {boolean} [timeOn]
 * @property {boolean} [platformOn]
 * @property {boolean} [distanceOn]
 * @property {boolean} [cargoTonnageOn]
 * @property {boolean} [dailyInspectionOn] 일상점검표 사용(메인 차량 — 기사차량은 subCarSettings)
 * @property {Array<string>} [notifOff] 알림 화면에서 끈 알림 종류(NOTIF_KINDS)
 * @property {boolean} [fixedRouteOn]
 * @property {Array<{ id: string, loadLoc: string, unloadLoc: string }>} [fixedRoutePresets]
 * @property {boolean} [runCountToggle]
 * @property {Array<number>} [runCountPresets]
 * @property {boolean} [subFixedRouteOn]
 * @property {Array<{ id: string, loadLoc: string, unloadLoc: string }>} [subFixedRoutePresets]
 * @property {boolean} [subRunCountToggle]
 * @property {Array<number>} [subRunCountPresets]
 * @property {Array<string>} [pinnedLocations]
 * @property {Record<string, SubCarPracticeSettings>} [subCarSettings] 서브차량 번호별 전용 값(세부입력 5종+달력 표시방식만, 결제/고정노선은 공용)
 */

/**
 * @typedef {Object} SubCarPracticeSettings
 * @property {'count'|'fare'} inputMode
 * @property {boolean} callDetail
 * @property {boolean} timeOn
 * @property {boolean} platformOn
 * @property {boolean} distanceOn
 * @property {boolean} cargoTonnageOn
 * @property {boolean} [dailyInspectionOn] 일상점검표 사용(9-B-1)
 */

export {}
