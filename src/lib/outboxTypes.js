// @ts-check
// outbox·직접 mutation 파일들이 공유하는 JSDoc 타입(런타임 코드 없음) — 한 곳에 둬야 모양이 어긋나지 않는다.

/** @typedef {'vehicle'|'client'|'driverLink'} OutboxResourceType */
/** @typedef {'tombstone'|'mutation'} OutboxKind */

/**
 * 기사 레코드. driverLink upsert op의 payload.previousDriverSnapshot과
 * outboxRollback.js의 롤백 대상이 이 모양이다.
 * @typedef {object} DriverRecord
 * @property {string} id
 * @property {string} [name]
 * @property {string} [phone]
 * @property {string} [vehicleNumber]
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [inviteCode]
 * @property {'pending'|'linked'} [status]
 * @property {number|string} [supabaseId]
 * @property {string} [unlinkRequestedBy] 연동 해제를 요청한 사람 id(차주 또는 기사)
 * @property {string} [unlinkRequestedAt] 해제 요청 시각(ISO) — 3일 지나면 자동 해제
 */

/**
 * op.payload의 실제 사용 필드 전부 — resourceType/operation 조합마다 부분집합만
 * 채워진다(예: 차량 삭제 tombstone은 비워 두고, 기사 upsert는 대부분 채운다).
 * @typedef {object} OutboxPayload
 * @property {number|string|null} [supabaseId]
 * @property {string} [vehicleNumber]
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [inviteCode]
 * @property {DriverRecord|null} [previousDriverSnapshot]
 * @property {'pending'|'linked'} [status]
 */

/**
 * @typedef {object} OutboxOp
 * @property {string} id
 * @property {string} ownerKey
 * @property {string} userId
 * @property {OutboxResourceType} resourceType
 * @property {string} resourceId
 * @property {OutboxKind} kind
 * @property {string} operation
 * @property {OutboxPayload} payload
 * @property {number} sessionEpoch
 * @property {string} createdAt
 */

/** @typedef {{ userId: string|null, ownerKey: string|null, epoch: number }} SessionCapture */

/**
 * `cars` 도메인 레코드 중 outbox 실행기가 실제로 읽는 필드만.
 * @typedef {object} CarRecord
 * @property {string} id
 * @property {string} [number]
 * @property {'main'|'sub'} [type]
 * @property {number|string} [supabaseId]
 */

/**
 * `driver_links` 테이블에서 upsert가 돌려주는 원본 행(supabase-js가 Database 제네릭
 * 없이 쓰이고 있어 실제 컬럼 타입을 여기서 명시한다).
 * @typedef {object} DriverLinkRow
 * @property {number|string} id
 * @property {string} [owner_id]
 * @property {string|null} [driver_id]
 * @property {string|null} [vehicle_id]
 * @property {string} [invite_code]
 * @property {string|null} [assignment_start]
 * @property {string|null} [assignment_end]
 * @property {'pending'|'linked'|'disconnected'} [status]
 */

/**
 * App.jsx가 들고 있는 화면 단위 로그인 세션(cloudSession.js의 저수준 epoch 세션과는
 * 다른 개념 — 이쪽은 UI가 보는 "누가 로그인했는지/게스트인지").
 * @typedef {object} AppSession
 * @property {string|null} [userId]
 * @property {string} [name]
 * @property {string} [phone]
 * @property {string} [accountType]
 * @property {string|null} [linkedOwnerId] 연동된 차주 id(employed_driver일 때 ownerKey로 씀)
 * @property {boolean} [guestMode]
 */

export {}
