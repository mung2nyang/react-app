// @ts-check
// cars.js에서 분리: 차량 등록/수정 draft → 저장할 기사 관련 필드 정규화(순수 함수).
import { driverIncomeFieldsFromDraft } from './driverIncomeDeductions.js'

/**
 * @typedef {Object} CarUpsertDraft
 * @property {string} [number]
 * @property {string} [tonnage]
 * @property {'main'|'sub'} [type]
 * @property {string} [driverName]
 * @property {string} [driverPhone]
 * @property {string} [driverPayMode]
 * @property {string} [driverSalaryAmount]
 * @property {boolean} [commEnabled]
 * @property {string} [commType]
 * @property {string} [commission]
 * @property {boolean} [insuranceOn]
 * @property {string} [driverIncomeType]
 * @property {boolean} [withholdingOn]
 * @property {string|number} [expenseRate]
 * @property {string|number} [insuranceRate]
 */

/**
 * @typedef {Object} DriverFields 메인 차량은 기사 정산 필드 없이 기본값만 돌려준다
 * @property {string} driverName
 * @property {string} driverPhone
 * @property {boolean} commEnabled
 * @property {string} commType
 * @property {string} commission
 * @property {boolean} insuranceOn
 * @property {string} [driverPayMode]
 * @property {string} [driverSalaryAmount]
 * @property {'employee'|'business'} [driverIncomeType]
 * @property {boolean} [withholdingOn]
 * @property {string} [expenseRate]
 * @property {string} [insuranceRate]
 */

/**
 * @param {CarUpsertDraft} draft
 * @param {'main'|'sub'} type
 * @returns {DriverFields}
 */
export function driverFieldsFromDraft(draft, type) {
  if (type !== 'sub') {
    return {
      driverName: '',
      driverPhone: '',
      commEnabled: false,
      commType: 'percent',
      commission: '',
      insuranceOn: false,
    }
  }
  const commType = draft.commType === 'direct' ? 'direct' : 'percent'
  const driverPayMode = draft.driverPayMode === 'salary' ? 'salary' : 'revenue'
  const commEnabled = driverPayMode === 'revenue'
  const driverSalaryAmount = String(draft.driverSalaryAmount || '').replace(/\D/g, '')
  return {
    driverName: String(draft.driverName || '').trim(),
    driverPhone: String(draft.driverPhone || '').trim(),
    driverPayMode,
    driverSalaryAmount: driverPayMode === 'salary' ? driverSalaryAmount : '',
    commEnabled,
    commType,
    commission: commEnabled ? String(draft.commission || '').trim() : '',
    ...driverIncomeFieldsFromDraft(draft),
  }
}
