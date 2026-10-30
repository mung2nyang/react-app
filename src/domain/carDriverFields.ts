// cars.ts에서 분리: 차량 등록/수정 draft → 저장할 기사 관련 필드 정규화(순수 함수).
import { driverIncomeFieldsFromDraft } from './driverIncomeDeductions.ts'

export type CarUpsertDraft = {
  number?: string
  tonnage?: string
  type?: 'main' | 'sub'
  driverName?: string
  driverPhone?: string
  driverPayMode?: string
  driverSalaryAmount?: string
  commEnabled?: boolean
  commType?: string
  commission?: string
  insuranceOn?: boolean
  driverIncomeType?: string
  withholdingOn?: boolean
  expenseRate?: string | number
  insuranceRate?: string | number
  driverShareBase?: string
}

/** 메인 차량은 기사 정산 필드 없이 기본값만 돌려준다 */
export type DriverFields = {
  driverName: string
  driverPhone: string
  commEnabled: boolean
  commType: string
  commission: string
  insuranceOn: boolean
  driverPayMode?: string
  driverSalaryAmount?: string
  driverIncomeType?: 'employee' | 'business'
  withholdingOn?: boolean
  expenseRate?: string
  insuranceRate?: string
  /** 매출제 기사 몫 기준(로드맵 61) */
  driverShareBase?: 'gross' | 'afterClientCommission'
}

export function driverFieldsFromDraft(draft: CarUpsertDraft, type: 'main' | 'sub'): DriverFields {
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
  const driverPayMode = draft.driverPayMode === 'salary' ? 'salary' : 'revenue'
  const commEnabled = driverPayMode === 'revenue'
  const driverSalaryAmount = String(draft.driverSalaryAmount || '').replace(/\D/g, '')
  return {
    driverName: String(draft.driverName || '').trim(),
    driverPhone: String(draft.driverPhone || '').trim(),
    driverPayMode,
    driverSalaryAmount: driverPayMode === 'salary' ? driverSalaryAmount : '',
    commEnabled,
    commType: 'percent',
    commission: commEnabled ? String(draft.commission || '').trim() : '',
    driverShareBase: draft.driverShareBase === 'afterClientCommission' ? 'afterClientCommission' : 'gross',
    ...driverIncomeFieldsFromDraft(draft),
  }
}
