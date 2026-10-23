// 거래처 등록 칸 읽기 — 이름은 꼭, 연락처·결제 주기·수수료는 앱 목록·범위 안일 때만(로드맵 24-G-1).
import type { Json } from './question.ts'

export type ClientDraft = {
  name: string, manager: string, phone: string,
  paymentTerm: string, paymentTermValue: number | null,
  commType: 'percent' | 'direct' | '', commValue: number | null,
}

const NAME_MAX = 50
const MANAGER_MAX = 30
// 앱 domain/clientPaymentTerms.ts 목록과 같게 — 서버는 앱 파일을 못 읽는다.
export const PAYMENT_TERMS = ['same_day', 'after_days', 'next_month_day', 'next_month_end', 'second_month_day', 'second_month_end']
const DAY_TERMS = ['next_month_day', 'second_month_day']

function textOf(value: Json | undefined, max: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length <= max ? text : ''
}

// 숫자·하이픈만 남겨 숫자 9~13자리일 때만(지역번호·휴대폰).
function phoneOf(value: Json | undefined): string {
  const kept = typeof value === 'string' ? value.replace(/[^0-9-]/g, '') : ''
  const digits = kept.replace(/-/g, '').length
  return digits >= 9 && digits <= 13 ? kept : ''
}

function termValueOf(term: string, value: Json | undefined): number | null {
  const max = term === 'after_days' ? 365 : DAY_TERMS.includes(term) ? 31 : 0
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max ? value : null
}

/** 이름이 없으면 null(거래처 등록이 아님). */
export function readClientDraft(row: { [key: string]: Json }): ClientDraft | null {
  const name = textOf(row.clientName, NAME_MAX)
  if (!name) return null
  const term = typeof row.paymentTerm === 'string' && PAYMENT_TERMS.includes(row.paymentTerm) ? row.paymentTerm : ''
  const type = row.commType === 'percent' || row.commType === 'direct' ? row.commType : ''
  const value = row.commValue
  const commOk = type !== '' && typeof value === 'number' && Number.isFinite(value) && value >= 0
    && (type === 'percent' ? value <= 100 : Number.isSafeInteger(value))
  return {
    name,
    manager: textOf(row.clientManager, MANAGER_MAX),
    phone: phoneOf(row.clientPhone),
    paymentTerm: term,
    paymentTermValue: termValueOf(term, row.paymentTermValue),
    commType: commOk ? type : '',
    commValue: commOk ? value : null,
  }
}
