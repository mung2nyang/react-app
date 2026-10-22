// JSON 값 모양 타입 정본(타입 전용 모듈). 계산 규칙·데이터·화면이 같이 쓴다.
/**
 * JSON.parse가 실제로 돌려줄 수 있는 모든 값의 모양을
 * 정확히 표현하는 재귀 타입. `object`/`{}`(아무 모양이나 통과)로 뭉뚱그리지 않고,
 * 이 타입으로 받은 값은 `typeof`/`Array.isArray`/`!== null`로 실제 좁혀야만 필드에
 * 접근할 수 있다 — durablePatchSchema.js가 이 타입으로 durable JSON의 내부 값
 * (dateKey별 patch, callDetails 각 항목)까지 전부 런타임 검증한다.
 */
export type JsonValue = string | number | boolean | null | JsonArray | JsonRecord
export type JsonArray = Array<JsonValue>
export type JsonRecord = { [key: string]: JsonValue }
