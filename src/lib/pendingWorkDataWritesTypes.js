// @ts-check
// pending 큐 타입 정본(타입 전용 모듈).
/**
 * day-log/dayLogTypes.js의 CallDetailLike(domain 정본 + id 필수)와 같은 좁힘이다 —
 * lib/는 components/를 참조하지 않는 방향을 지키려고 여기서 직접 좁혀서 정의한다
 * (durable에 저장되는 콜상세는 useDayDraft.js 진입 전에
 * backfillCallDetailIds가 이미 돌아 id가 항상 있다).
 * @typedef {import('../domain/callDetail.js').CallDetailLike & { id: string }} EffectiveCallDetail
 */

/**
 * durable 큐가 저장하는 "완성된 Effective Patch" — useDayDraft.js commitNow가 draft 전체로 만들어 5개 필드를 항상 채운다.
 * 전부 필수다: 하나만 있는 값을 정상으로 통과시키면 saveDayRecord가 나머지를 기본값으로 덮어 기존 일지를 지운다. 횟수는 number만.
 * @typedef {Object} EffectivePatch
 * @property {boolean} isOff
 * @property {number} fixedCount
 * @property {number} palletCount
 * @property {Array<EffectiveCallDetail>} callDetails
 * @property {Record<string, number>} fixedRouteCounts
 */

/**
 * JSON.parse가 실제로 돌려줄 수 있는 모든 값의 모양을
 * 정확히 표현하는 재귀 타입. `object`/`{}`(아무 모양이나 통과)로 뭉뚱그리지 않고,
 * 이 타입으로 받은 값은 `typeof`/`Array.isArray`/`!== null`로 실제 좁혀야만 필드에
 * 접근할 수 있다 — durablePatchSchema.js가 이 타입으로 durable JSON의 내부 값
 * (dateKey별 patch, callDetails 각 항목)까지 전부 런타임 검증한다.
 * @typedef {string|number|boolean|null|JsonArray|JsonRecord} JsonValue
 */
/** @typedef {Array<JsonValue>} JsonArray */
/** @typedef {{ [key: string]: JsonValue }} JsonRecord */

/**
 * durable(localStorage) 읽기의 결과를 "정상적으로 비어
 * 있음"과 "읽기 자체가 실패함"으로 명시적으로 구분하는 타입. `{ ok: true, value: {} }`는
 * 그 owner가 한 번도 durable에 등록한 적 없는(또는 이미 전부 정리된) 정상적인 빈
 * 상태다. `{ ok: false }`는 localStorage 접근 실패·JSON 파싱 실패·예상과 다른 모양
 * (배열 등) 중 하나로, "durable에 뭐가 있는지 지금은 알 수 없다"는 뜻이다 — 이
 * 둘을 같은 값(`{}`)으로 뭉뚱그리면, 실제로는 다른 날짜의 원문이 들어 있는데 그걸
 * "비어 있다"고 착각해 그 위에 빈 객체 기반으로 다시 써서 파괴할 수 있다.
 * @typedef {{ ok: true, value: Record<string, EffectivePatch> } | { ok: false }} DurableReadResult
 */

/**
 * localStorage.length/localStorage.key() 열거 자체가
 * 실패하는 경우를 "owner가 하나도 없다"(빈 배열)와 구분한다.
 * @typedef {{ ok: true, owners: Array<string> } | { ok: false }} OwnerEnumerationResult
 */

export {}
