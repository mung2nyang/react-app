// @ts-check
// 콜 상세 한 건의 모양 검사(Valibot). 저장 기록은 id 선택(옛 콜), 저장 대기 기록은 id 필수. 목록 밖 칸은 거부 — 칸을 늘리면 domain/callDetail.js와 함께.
import * as v from 'valibot'
import { parseCurrencyValue } from '../domain/money.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectiveCallDetail} EffectiveCallDetail */

/** @param {JsonValue} value @returns {value is Record<string, JsonValue>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * payments.js/financeCore.js가 실제로 받는 금액: 숫자이거나, parseCurrencyValue가
 * 다루는 통화 문자열(`"1,000"`, `"1,000원"`). 임의 문자열·음수 기호·NaN/Infinity 표기는 거부.
 * @param {JsonValue} value
 * @returns {boolean}
 */
export function isValidCurrencyAmount(value) {
  if (typeof value === 'number') return Number.isInteger(value) && Number.isFinite(value) && value >= 0
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  // 빈 값 = 미입력(0) — parseCurrencyValue('')===0과 같은 규약(없으면 산재보험료 빈 콜이 전부 거부됨).
  if (trimmed === '') return true
  // 쉼표 없는 정수, 또는 천 단위 쉼표 그룹(3자리). 선택적으로 끝의 `원`(앞에 공백 하나).
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\s?원)?$/.test(trimmed)) return false
  const parsed = parseCurrencyValue(trimmed)
  return Number.isFinite(parsed) && parsed >= 0
}

// Valibot은 배열도 객체로 받고 검사 뒤엔 새 객체를 넘기므로, 객체 검사 앞에서 배열을 먼저 거른다.
/** @param {(value: Record<string, JsonValue>) => boolean} [extra] */
const plainObject = (extra = () => true) => v.custom((input) => isPlainObject(/** @type {JsonValue} */ (input)) && extra(/** @type {Record<string, JsonValue>} */ (input)))
const opt = v.exactOptional
const str = v.string()
const amount = v.custom((input) => isValidCurrencyAmount(/** @type {JsonValue} */ (input)))

const COMMISSION_SNAPSHOT = v.pipe(plainObject(), v.strictObject({
  enabled: v.boolean(),
  type: v.nullable(str),
  // 지금까지처럼 숫자면 다 받는다(Valibot number는 NaN을 거부해서 typeof로).
  value: v.nullable(v.union([str, v.custom((input) => typeof input === 'number')])),
}))

// 입금 항목은 칸이 모두 선택이다(id 없는 옛 항목, 금액이 통화 글자인 값도 정상).
const PAYMENT = v.pipe(plainObject(), v.strictObject({
  id: opt(str), amount: opt(amount), paidAt: opt(str), note: opt(str),
}))

// domain/callDetail.js의 CallDetailLike 칸 전체.
const CALL_DETAIL_FIELDS = {
  id: opt(v.pipe(str, v.nonEmpty())), loadLoc: opt(str), unloadLoc: opt(str), fare: opt(amount), client: opt(str),
  clientId: opt(v.nullable(str)), commissionSnapshot: opt(COMMISSION_SNAPSHOT),
  remarks: opt(str), vatExempt: opt(v.boolean()), paymentStatus: opt(str), payments: opt(v.array(PAYMENT)),
  paymentDueDate: opt(str), workDate: opt(str),
  distanceType: opt(str), linkedLoadIndex: opt(str), departureTime: opt(str), arrivalTime: opt(str), platform: opt(str),
  cargoTonnage: opt(v.union([str, v.pipe(v.number(), v.finite(), v.minValue(0))])),
  receipt: opt(str), startOdometer: opt(str), endOdometer: opt(str), distanceKm: opt(str), insuranceFee: opt(amount),
}

/** 이 목록 밖의 칸은 거부한다 — 서버 기록 합치기(hydrateMergeWork.js)도 이 목록으로 모르는 칸을 거른다. */
export const ALLOWED_CALL_DETAIL_KEYS = Object.keys(CALL_DETAIL_FIELDS)

// 빈 객체 {}는 콜로 치지 않는다.
const CALL_DETAIL = v.pipe(plainObject((value) => Object.keys(value).length > 0), v.strictObject(CALL_DETAIL_FIELDS))

/**
 * 저장된 하루 기록용 — id는 선택(옛 콜), 빈 콜·빈 글자 id는 거부.
 * @param {JsonValue} item
 */
export function isPersistedCallDetail(item) {
  return v.is(CALL_DETAIL, item)
}

/**
 * 저장 대기 기록용 — 비어 있지 않은 id가 필수다.
 * @param {JsonValue} item
 * @returns {item is EffectiveCallDetail}
 */
export function isValidCallDetail(item) {
  return isPersistedCallDetail(item) && isPlainObject(item) && typeof item.id === 'string' && item.id !== ''
}
