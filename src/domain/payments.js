// @ts-check
// 콜상세 한 건의 부분입금 원장(payments[])을 다루는 순수 함수.
// migration-plan.md의 domain/payments.ts에 대응하는 자리 — Step 4에서 domain/으로
// 옮길 때까지는 workData.js에서 분리된 파일로 유지한다 (Step 1: 200줄 제한 준수).
import { findCallDetailIndex } from './callDetailIds.js'
import { getDetailPaymentSummary, syncDetailPaymentStatus } from './finance.js'
import { parseCurrencyValue } from './money.js'
import { getCallDetails } from './day-record.js'

/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {Record<string, DayRecordLike>} WorkDataMap */
/**
 * 쓰기 함수 공통 반환. 입력 map 타입 T를 그대로 보존해 호출부(예: DayLogPage의
 * id 필수 CallDetailLike)와 도메인 DayRecordLike가 어긋나지 않게 한다.
 * @template {WorkDataMap} T
 * @typedef {{ data: T, error?: string }} PaymentMutationResult
 */

/**
 * @param {string} prefix
 * @returns {string}
 */
export function generateLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * @template {WorkDataMap} T
 * @param {T} data
 * @param {string} dateKey
 * @param {string} detailId
 * @param {(detail: CallDetailLike) => string|null} mutator
 * @returns {PaymentMutationResult<T>}
 */
function withCallDetail(data, dateKey, detailId, mutator) {
  const record = data?.[dateKey]
  const details = getCallDetails(record)
  const detailIndex = findCallDetailIndex(details, detailId)
  if (!record || detailIndex < 0) return { error: '세부 입력을 찾지 못했습니다.', data }
  const nextDetails = details.map((item, index) => (index === detailIndex ? { ...item, payments: Array.isArray(item.payments) ? [...item.payments] : item.payments } : item))
  const detail = nextDetails[detailIndex]
  const error = mutator(detail)
  if (error) return { error, data }
  const next = { ...data, [dateKey]: { ...record, callDetails: nextDetails } }
  return { data: next }
}

/**
 * @param {CallDetailLike} detail
 * @returns {void}
 */
function ensurePaymentList(detail) {
  if (Array.isArray(detail.payments)) return
  detail.payments = []
  if ((detail.paymentStatus || '미수') !== '미수') {
    const fare = parseCurrencyValue(detail.fare)
    if (fare > 0) {
      detail.payments.push({ id: generateLocalId('pay'), amount: fare, paidAt: new Date().toISOString(), note: '(이전 기록)' })
    }
  }
}

/**
 * @template {WorkDataMap} T
 * @param {T} data
 * @param {string} dateKey
 * @param {string} detailId
 * @param {unknown} amount
 * @param {Date|string} [paidAt]
 * @returns {PaymentMutationResult<T>}
 */
export function addPartialPayment(data, dateKey, detailId, amount, paidAt = new Date()) {
  return withCallDetail(data, dateKey, detailId, (detail) => {
    const value = parseCurrencyValue(amount)
    if (!(value > 0)) return '입금액을 올바르게 입력해 주세요.'
    const summary = getDetailPaymentSummary(detail)
    if (value > summary.remainingAmount) return '남은 금액보다 큰 금액은 입력할 수 없습니다.'
    ensurePaymentList(detail)
    detail.payments = [...(detail.payments || []), {
      id: generateLocalId('pay'),
      amount: value,
      paidAt: paidAt instanceof Date ? paidAt.toISOString() : paidAt,
      note: '',
    }]
    syncDetailPaymentStatus(detail)
    return null
  })
}

/**
 * @template {WorkDataMap} T
 * @param {T} data
 * @param {string} dateKey
 * @param {string} detailId
 * @returns {PaymentMutationResult<T>}
 */
export function undoLastPayment(data, dateKey, detailId) {
  return withCallDetail(data, dateKey, detailId, (detail) => {
    if (!Array.isArray(detail.payments) || detail.payments.length === 0) {
      return '되돌릴 입금 기록이 없습니다.'
    }
    detail.payments = detail.payments.slice(0, -1)
    syncDetailPaymentStatus(detail)
    return null
  })
}

/**
 * @template {WorkDataMap} T
 * @param {T} data
 * @param {string} dateKey
 * @param {string} detailId
 * @param {Date|string} [paidAt]
 * @returns {PaymentMutationResult<T>}
 */
export function markReceivableItemPaid(data, dateKey, detailId, paidAt = new Date()) {
  return withCallDetail(data, dateKey, detailId, (detail) => {
    const summary = getDetailPaymentSummary(detail)
    if (summary.status === 'paid') return '이미 처리된 내역입니다.'
    ensurePaymentList(detail)
    if (summary.remainingAmount > 0) {
      detail.payments = [...(detail.payments || []), {
        id: generateLocalId('pay'),
        amount: summary.remainingAmount,
        paidAt: paidAt instanceof Date ? paidAt.toISOString() : paidAt,
        note: '',
      }]
    }
    syncDetailPaymentStatus(detail)
    return null
  })
}

/**
 * @template {WorkDataMap} T
 * @param {T} data
 * @param {string} dateKey
 * @param {string} detailId
 * @param {Date|string} [paidAt]
 * @returns {PaymentMutationResult<T>}
 */
export function toggleCallPaymentStatus(data, dateKey, detailId, paidAt = new Date()) {
  const details = getCallDetails(data?.[dateKey])
  const detailIndex = findCallDetailIndex(details, detailId)
  const detail = details[detailIndex]
  if (!detail) return { error: '세부 입력을 찾지 못했습니다.', data }
  if (getDetailPaymentSummary(detail).status === 'paid') {
    return withCallDetail(data, dateKey, detailId, (item) => {
      item.payments = []
      syncDetailPaymentStatus(item)
      return null
    })
  }
  return markReceivableItemPaid(data, dateKey, detailId, paidAt)
}
