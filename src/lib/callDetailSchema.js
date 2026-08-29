// @ts-check
// 재감사 9차(FAIL 지적 2번) — durable에 저장되는 콜상세는 useDayDraft.js 진입 전에
// domain/day-record.js의 backfillCallDetailIds가 이미 돈 뒤라 id 없는 항목이 있을 수
// 없다(실제 계약). 예전 검증기는 `id`가 "있으면 문자열이어야 한다" 정도만 봐서
// `{}`/`{id:""}`/id 자체가 없는 `{fare:"1000"}` 같은 값도 통과시켰다 — day-record.js가
// 이런 값을 실제 CallDetailLike로 오인해 뒤섞이면 콜상세 목록 자체가 깨질 수 있다.
// 정의되지 않은 추가 필드(레거시/서버가 몰래 얹은 필드 등)도 이제 명시적으로 거부한다
// — 여기 없는 필드가 실제로 필요해지면 CallDetailLike 정본(domain/callDetail.js)과
// 이 검증기 양쪽에 같이 추가해야 한다(스키마 드리프트 방지).
import { parseCurrencyValue } from '../domain/money.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectiveCallDetail} EffectiveCallDetail */

/** @param {JsonValue} value @returns {value is Record<string, JsonValue>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {JsonValue} value @returns {boolean} 0 이상의 유한한 숫자(금액류 — 정수만은 아니다) */
function isNonNegativeFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
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
  // 쉼표 없는 정수, 또는 천 단위 쉼표 그룹(3자리). 선택적으로 끝의 `원`(앞에 공백 하나).
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\s?원)?$/.test(trimmed)) return false
  const parsed = parseCurrencyValue(trimmed)
  return Number.isFinite(parsed) && parsed >= 0
}

// domain/callDetail.js의 CallDetailLike가 선언한 필드 전체 — 이 목록 밖의 키가 있으면
// 거부한다(레거시 데이터에 정말 필요한 필드가 생기면 여기와 callDetail.js 둘 다 고친다).
const ALLOWED_CALL_DETAIL_KEYS = /** @type {const} */ ([
  'id', 'loadLoc', 'unloadLoc', 'fare', 'client', 'clientId', 'commissionSnapshot',
  'remarks', 'vatExempt', 'paymentStatus', 'payments', 'paymentDueDate', 'workDate',
  'distanceType', 'linkedLoadIndex', 'departureTime', 'arrivalTime', 'platform',
  'cargoTonnage', 'receipt', 'startOdometer', 'endOdometer', 'distanceKm',
])
const ALLOWED_COMMISSION_KEYS = /** @type {const} */ (['enabled', 'type', 'value'])
const ALLOWED_PAYMENT_KEYS = /** @type {const} */ (['id', 'amount', 'paidAt', 'note'])

/** @param {JsonValue} value @returns {boolean} */
function isValidCommissionSnapshot(value) {
  if (!isPlainObject(value)) return false
  if (Object.keys(value).some((key) => !ALLOWED_COMMISSION_KEYS.includes(/** @type {typeof ALLOWED_COMMISSION_KEYS[number]} */ (key)))) return false
  if (typeof value.enabled !== 'boolean') return false
  if (value.type !== null && typeof value.type !== 'string') return false
  if (value.value !== null && typeof value.value !== 'string' && typeof value.value !== 'number') return false
  return true
}

/**
 * 재감사 10차(FAIL 지적 1번, P0) — 9차는 payments.js(addPartialPayment 등)가 "새로"
 * 만드는 값만 보고 id/amount를 필수·amount를 숫자 전용으로 강제했다. 하지만
 * domain/callDetail.js의 Payment 타입(`{ id?: string, amount?: string|number,
 * paidAt?: string, note?: string }`, 전부 optional)과 financeCore.js의
 * `getDetailPaymentSummary`(`parseCurrencyValue(payment.amount)` — 통화 문자열도
 * 그대로 받는다)가 실제로 보존·계산하는 값은 훨씬 넓다 — id가 아예 없는 레거시
 * payment(day-record.js/backfillCallDetailIds는 콜상세 자신의 id만 채우지, 중첩된
 * payments[] 항목의 id는 손대지 않는다), amount가 통화 문자열(`"1,000"`)인 값 전부
 * 실제로 존재하고 정상 작동한다. 이 검증기는 도메인 타입 그대로 전부 optional로
 * 되돌린다 — 있는 필드만 타입을 검사하고, 없는 필드는 통과시킨다.
 * @param {JsonValue} value @returns {boolean}
 */
function isValidPayment(value) {
  if (!isPlainObject(value)) return false
  if (Object.keys(value).some((key) => !ALLOWED_PAYMENT_KEYS.includes(/** @type {typeof ALLOWED_PAYMENT_KEYS[number]} */ (key)))) return false
  if ('id' in value && typeof value.id !== 'string') return false
  if ('amount' in value && !isValidCurrencyAmount(value.amount)) return false
  if ('paidAt' in value && typeof value.paidAt !== 'string') return false
  if ('note' in value && typeof value.note !== 'string') return false
  return true
}

/**
 * @param {JsonValue} item
 * @returns {item is EffectiveCallDetail}
 */
export function isValidCallDetail(item) {
  if (!isPlainObject(item)) return false
  if (Object.keys(item).some((key) => !ALLOWED_CALL_DETAIL_KEYS.includes(/** @type {typeof ALLOWED_CALL_DETAIL_KEYS[number]} */ (key)))) return false
  // 재감사 9차(FAIL 지적 2번) — useDayDraft 진입 전 backfillCallDetailIds가 이미 돌아
  // 모든 콜상세가 비어 있지 않은 id를 반드시 가진다. id 없는(또는 빈 문자열) 항목은
  // 거부한다.
  if (typeof item.id !== 'string' || item.id === '') return false
  if ('loadLoc' in item && typeof item.loadLoc !== 'string') return false
  if ('unloadLoc' in item && typeof item.unloadLoc !== 'string') return false
  if ('fare' in item) {
    if (typeof item.fare !== 'string' && typeof item.fare !== 'number') return false
    if (typeof item.fare === 'number' && !isNonNegativeFiniteNumber(item.fare)) return false
  }
  if ('client' in item && typeof item.client !== 'string') return false
  if ('clientId' in item && item.clientId !== null && typeof item.clientId !== 'string') return false
  if ('remarks' in item && typeof item.remarks !== 'string') return false
  if ('vatExempt' in item && typeof item.vatExempt !== 'boolean') return false
  if ('paymentStatus' in item && typeof item.paymentStatus !== 'string') return false
  if ('paymentDueDate' in item && typeof item.paymentDueDate !== 'string') return false
  if ('workDate' in item && typeof item.workDate !== 'string') return false
  if ('distanceType' in item && typeof item.distanceType !== 'string') return false
  if ('linkedLoadIndex' in item && typeof item.linkedLoadIndex !== 'string') return false
  if ('departureTime' in item && typeof item.departureTime !== 'string') return false
  if ('arrivalTime' in item && typeof item.arrivalTime !== 'string') return false
  if ('platform' in item && typeof item.platform !== 'string') return false
  if ('cargoTonnage' in item) {
    if (typeof item.cargoTonnage !== 'string' && typeof item.cargoTonnage !== 'number') return false
    if (typeof item.cargoTonnage === 'number' && !isNonNegativeFiniteNumber(item.cargoTonnage)) return false
  }
  if ('receipt' in item && typeof item.receipt !== 'string') return false
  if ('startOdometer' in item && typeof item.startOdometer !== 'string') return false
  if ('endOdometer' in item && typeof item.endOdometer !== 'string') return false
  if ('distanceKm' in item && typeof item.distanceKm !== 'string') return false
  if ('commissionSnapshot' in item && !isValidCommissionSnapshot(item.commissionSnapshot)) return false
  if ('payments' in item) {
    if (!Array.isArray(item.payments)) return false
    for (const p of item.payments) if (!isValidPayment(p)) return false
  }
  return true
}
