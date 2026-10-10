// @ts-check
// day-log/ 컴포넌트들이 공유하는 JSDoc 타입만 모은 파일(런타임 코드 없음). call-details.js가 실제로 만드는
// 콜상세 모양(buildCallDetail), lib/clients.js가 다루는 거래처 모양, lib/expenses.js가
// 다루는 비용 항목 모양을 정확히 문서화한다 — 여러 컴포넌트가 각자 느슨한 object로
// 적으면 서로 어긋나기 쉽다.
/** @typedef {ReturnType<typeof import('../../domain/practiceSettings.js').normalizeSettings>} Settings */

// 콜상세 모양 정본은 domain/callDetail.js. day-log/ 안에서 다루는 콜상세는 전부 day-record.js의 getCallDetails를 거쳐 오거나
// call-details.js의 buildCallDetail이 막 만든 것이라 id가 항상 있다 — domain
// 레벨에서는(콜상세가 아직 없는 자리를 가리킬 수도 있어) 선택 필드지만, 여기서는
// 필수로 좁혀서 day-log/ 전체가 같은(항상 id 있는) 타입을 쓰게 한다.
/** @typedef {import('../../domain/callDetail.js').CallDetailLike & { id: string }} CallDetailLike */

// ClientLike·ExpenseItem 정본은 domain/clientTypes.js·expenseTypes.js(이름만 이어 받음).
/** @typedef {import('../../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

/**
 * finance.js의 getDetailPaymentSummary 반환 모양(그 파일은 아직 // @ts-check가 없다).
 * @typedef {Object} PaymentSummary
 * @property {number} paidAmount
 * @property {number} remainingAmount
 * @property {'paid'|'partial'|'unpaid'} status
 */

export {}
