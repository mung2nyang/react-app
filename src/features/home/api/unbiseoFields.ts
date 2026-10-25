// 운비서 칸 읽기 — 서버 답의 종류별 칸을 앱 목록·범위로 다시 검사한다. 틀린 칸은 빈 칸.
import type { JsonValue } from '../../../domain/jsonTypes.ts'

export const CLIENT_NAME_MAX = 50
export const ROUTE_NAME_MAX = 60
const FIXED_COUNT_MAX = 20
const MANAGER_MAX = 30
const WEATHER_PLACE_MAX = 30
// 앱 거래처 결제 주기 목록(domain/clientPaymentTerms.ts)과 같은 값.
const PAYMENT_TERMS = ['same_day', 'after_days', 'next_month_day', 'next_month_end', 'second_month_day', 'second_month_end']

export type UnbiseoExpense = { date: string, type: 'maint' | 'fuel' | 'misc', cost: number | null, name: string, category: string, fuelType: string, payment: string }
export type UnbiseoFixed = { date: string, count: number, route: string }
export type UnbiseoWeather = { date: string, place: string }
/** 휴무 — off가 참이면 휴무로, 거짓이면 휴무 취소. */
export type UnbiseoDayOff = { date: string, off: boolean }
export type UnbiseoClient = { name: string, manager: string, phone: string, paymentTerm: string, paymentTermValue: number | null, commType: 'percent' | 'direct' | '', commValue: number | null }

export function record(value: JsonValue | undefined): { [key: string]: JsonValue } | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

export function text(row: { [key: string]: JsonValue }, key: string): string {
  const value = row[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function dateOf(row: { [key: string]: JsonValue }, today: string): string {
  const date = text(row, 'date')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today
}

export function wonOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function readExpense(row: { [key: string]: JsonValue }, today: string): UnbiseoExpense {
  const type = row.type === 'fuel' ? 'fuel' : row.type === 'misc' ? 'misc' : 'maint'
  return {
    date: dateOf(row, today),
    type,
    cost: wonOf(row.cost),
    name: text(row, 'name'),
    category: text(row, 'category'),
    fuelType: text(row, 'fuelType'),
    payment: text(row, 'payment'),
  }
}

// 고정 노선 — 횟수 1~20(밖이면 1), 노선 이름은 보낸 것과 같은 길이 안만(로드맵 24-F-2).
export function readFixed(row: { [key: string]: JsonValue }, today: string): UnbiseoFixed {
  const count = row.count
  const route = text(row, 'route')
  return {
    date: dateOf(row, today),
    count: typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= FIXED_COUNT_MAX ? count : 1,
    route: route.length <= ROUTE_NAME_MAX ? route : '',
  }
}

// 거래처 등록 — 이름은 꼭(50자), 그 밖은 서버(24-G-1)와 같은 범위 안일 때만, 아니면 빈 칸.
export function readClient(row: { [key: string]: JsonValue }): UnbiseoClient | null {
  const name = text(row, 'name')
  if (!name || name.length > CLIENT_NAME_MAX) return null
  const manager = text(row, 'manager')
  const digits = text(row, 'phone').replace(/[^0-9]/g, '').length
  const term = PAYMENT_TERMS.find((item) => item === row.paymentTerm) ?? ''
  const termValue = row.paymentTermValue
  const termMax = term === 'after_days' ? 365 : term === 'next_month_day' || term === 'second_month_day' ? 31 : 0
  const commType = row.commType === 'percent' || row.commType === 'direct' ? row.commType : ''
  const commValue = row.commValue
  const commOk = commType !== '' && typeof commValue === 'number' && commValue >= 0 && (commType === 'percent' ? commValue <= 100 : Number.isSafeInteger(commValue))
  return {
    name,
    manager: manager.length <= MANAGER_MAX ? manager : '',
    phone: digits >= 9 && digits <= 13 ? text(row, 'phone').replace(/[^0-9-]/g, '') : '',
    paymentTerm: term,
    paymentTermValue: typeof termValue === 'number' && Number.isInteger(termValue) && termValue >= 1 && termValue <= termMax ? termValue : null,
    commType: commOk ? commType : '',
    commValue: commOk ? commValue : null,
  }
}

// 날씨 — 날짜 모양이 틀리면 오늘, 지역은 30자까지.
export function readWeather(row: { [key: string]: JsonValue }, today: string): UnbiseoWeather {
  return { date: dateOf(row, today), place: text(row, 'place').slice(0, WEATHER_PLACE_MAX) }
}

// 휴무 — 날짜 모양이 틀리면 오늘(앞날 그대로), off가 참·거짓이 아니면 알아듣지 못함.
export function readDayOff(row: { [key: string]: JsonValue }, today: string): UnbiseoDayOff | null {
  return typeof row.off === 'boolean' ? { date: dateOf(row, today), off: row.off } : null
}
