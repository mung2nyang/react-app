// @ts-check
// 콜상세 폼 순수 헬퍼(초기값 구성·포맷팅).
import { dueDateForClient } from '../../lib/clients.js'
import { getCallDetailDurationMinutes } from '../../lib/finance.js'
import { formatCurrencyInput, formatWon, parseCurrencyValue } from '../../lib/money.js'

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
