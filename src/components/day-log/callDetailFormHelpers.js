// @ts-check
// 콜상세 폼 순수 헬퍼(초기값 구성·포맷팅).
import { dueDateForClient } from '../../lib/clients.js'
import { getCallDetailDurationMinutes } from '../../lib/finance.js'
import { formatCurrencyInput, formatWon, isLargeFare, parseCurrencyValue } from '../../lib/money.js'
import { confirmDialog } from '../shared/confirmDialog.jsx'

/** @typedef {import('./dayLogTypes.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */

export const emptyDraft = {
  client: '',
  fare: '',
  vatExempt: false,
  loadLoc: '',
  unloadLoc: '',
  paymentDueDate: '',
  departureTime: '',
  arrivalTime: '',
  platform: '',
  cargoTonnage: '',
  receipt: '',
  insuranceFee: '',
  remarks: '',
  startOdometer: '',
  endOdometer: '',
}

/**
 * @param {CallDetailLike} item
 * @param {string} dateKey
 * @param {Array<ClientLike>} clients
 */
export function draftFromDetail(item, dateKey, clients) {
  const client = clients.find((entry) => entry.companyName === item.client)
  return {
    client: item.client || '',
    fare: formatCurrencyInput(item.fare),
    vatExempt: !!item.vatExempt,
    loadLoc: item.loadLoc || '',
    unloadLoc: item.unloadLoc || '',
    paymentDueDate: item.paymentDueDate || dueDateForClient(dateKey, client),
    departureTime: item.departureTime || '',
    arrivalTime: item.arrivalTime || '',
    platform: item.platform || '',
    cargoTonnage: item.cargoTonnage == null || item.cargoTonnage === '' ? '' : String(item.cargoTonnage),
    receipt: item.receipt || '',
    insuranceFee: formatCurrencyInput(item.insuranceFee),
    remarks: item.remarks || '',
    startOdometer: formatCurrencyInput(item.startOdometer),
    endOdometer: formatCurrencyInput(item.endOdometer),
  }
}

/** @param {CallDetailLike} item */
export function commissionInfo(item) {
  const snap = item.commissionSnapshot
  if (!snap?.enabled) return { amount: 0, label: '' }
  const fare = parseCurrencyValue(item.fare)
  const amount = snap.type === 'percent' || !snap.type
    ? Math.floor(fare * (Number(snap.value) / 100))
    : parseCurrencyValue(snap.value)
  const label = snap.type === 'percent' || !snap.type ? `${snap.value}%` : formatWon(amount)
  return { amount, label }
}

/** @param {string|undefined} value */
export function formatCallTime(value) {
  if (!value) return '-'
  const [hourText, minute = '00'] = String(value).split(':')
  const hour = Number(hourText)
  if (Number.isNaN(hour)) return value
  return `${hour < 12 ? 'AM' : 'PM'}${hour % 12 || 12}시${minute === '00' ? '' : `${minute}분`}`
}

/** @param {{ departureTime?: string, arrivalTime?: string }} detail */
export function durationSuffix(detail) {
  const minutes = getCallDetailDurationMinutes(detail)
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return ` (${hours ? `${hours}시간` : ''}${mins ? `${mins}분` : ''})`
}

/**
 * 운송료가 1,000만원을 넘으면 저장 전에 한 번 묻는다(로드맵 43-C, 앱 확인 창). 넘지 않으면 바로 true.
 * @param {string|number|undefined} fare 쉼표 금액 글자
 * @returns {Promise<boolean>} true면 저장해도 된다.
 */
export async function confirmLargeFareSave(fare) {
  if (!isLargeFare(fare)) return true
  return confirmDialog({
    title: '운송료가 1,000만원을 넘습니다',
    message: `입력한 운송료: ${fare}원. 이 금액이 맞으면 저장해 주세요.`,
    confirmLabel: '이 금액으로 저장',
    cancelLabel: '금액 고치기',
  })
}
