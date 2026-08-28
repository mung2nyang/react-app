// @ts-check
// 재감사 3차(FAIL 지적 4번) — clients.js에 @ts-check를 붙이면서 200줄을 넘겨서
// 타입 선언만 이 파일로 뺐다(callDetail.js/dayLogTypes.js와 같은 관례, export {}
// 뿐인 타입 전용 모듈). ClientLike/ClientDraft의 정본은 여기다.
/**
 * @typedef {Object} ClientLike
 * @property {string} id
 * @property {string} companyName
 * @property {string} [managerName]
 * @property {string} [phone]
 * @property {string} [bizNumber]
 * @property {string} [paymentTerm]
 * @property {string} [paymentTermValue]
 * @property {boolean} [isPinned]
 * @property {boolean} [scopedToVehicleNumber]
 * @property {boolean} [commEnabled]
 * @property {string} [commType]
 * @property {string|number} [commValue]
 * @property {boolean} [fixedRouteLinked]
 * @property {boolean} [palletOn]
 * @property {string|number} [palletPrice]
 * @property {string|number} [fixedUnitPrice]
 * @property {string} [taxRepresentative]
 * @property {string} [taxEmail]
 * @property {string} [taxAddress]
 * @property {string} [taxBizType]
 * @property {string} [taxBizItem]
 * @property {string} [supabaseId]
 */

/**
 * upsertClient가 받는 입력 폼 값 — 아직 정규화 전이라 전부 느슨한 문자열/불리언이다.
 * @typedef {Object} ClientDraft
 * @property {string} [companyName]
 * @property {string} [managerName]
 * @property {string} [phone]
 * @property {string} [bizNumber]
 * @property {string} [paymentTerm]
 * @property {string|number} [paymentTermValue]
 * @property {string} [taxRepresentative]
 * @property {string} [taxEmail]
 * @property {string} [taxAddress]
 * @property {string} [taxBizType]
 * @property {string} [taxBizItem]
 * @property {boolean} [isPinned]
 */

export {}
