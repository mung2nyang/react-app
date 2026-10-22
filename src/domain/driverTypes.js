// @ts-check
// 기사 레코드 타입 정본(타입 전용 모듈).

/**
 * 기사 레코드.
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

export {}
