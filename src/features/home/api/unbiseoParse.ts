// 운비서 서버 함수(unbiseo-parse) 부르기 — 저장 없음, 실패는 쉬운 문구로(로드맵 24-B).
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { JsonValue } from '../../../domain/jsonTypes.ts'
import { supabase } from '../../../data/cloud/supabaseClient.ts'
import { readQuestion } from './unbiseoQuestion.ts'
import type { UnbiseoQuestion } from './unbiseoQuestion.ts'

export const TEXT_MAX = 300
const CLIENTS_MAX = 200
const CLIENT_NAME_MAX = 50
const ROUTES_MAX = 30
const ROUTE_NAME_MAX = 60
const FIXED_COUNT_MAX = 20
const MANAGER_MAX = 30
// 앱 거래처 결제 주기 목록(domain/clientPaymentTerms.ts)과 같은 값.
const PAYMENT_TERMS = ['same_day', 'after_days', 'next_month_day', 'next_month_end', 'second_month_day', 'second_month_end']

export type UnbiseoCall = { date: string, loadLoc: string, unloadLoc: string, fare: number | null, client: string }
export type UnbiseoExpense = { date: string, type: 'maint' | 'fuel' | 'misc', cost: number | null, name: string, category: string, fuelType: string, payment: string }
export type UnbiseoFixed = { date: string, count: number, route: string }
export type UnbiseoClient = { name: string, manager: string, phone: string, paymentTerm: string, paymentTermValue: number | null, commType: 'percent' | 'direct' | '', commValue: number | null }
/** [기록하기]·[등록하기]로 넘기는 것 — 운행·지출·고정 노선은 일지로, 거래처는 거래처 화면으로 */
export type UnbiseoRecord = UnbiseoCall | UnbiseoExpense | UnbiseoFixed | UnbiseoClient
export type UnbiseoResult =
  | { kind: 'call', call: UnbiseoCall }
  | { kind: 'expense', expense: UnbiseoExpense }
  | { kind: 'fixed', fixed: UnbiseoFixed }
  | { kind: 'client', client: UnbiseoClient }
  | { kind: 'question', question: UnbiseoQuestion }
  | { kind: 'unknown' }
  | { kind: 'error', message: string }

export const LOGIN_NEEDED = '로그인이 필요합니다.'
export const BAD_INPUT = '말이 너무 길거나 비었어요. 300자까지 다시 말해 주세요.'
export const NOT_UNDERSTOOD = '알아듣지 못했습니다. 다시 말해 주세요.'
export const TRY_LATER = '잠시 뒤 다시 시도해 주세요.'

function record(value: JsonValue | undefined): { [key: string]: JsonValue } | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function text(row: { [key: string]: JsonValue }, key: string): string {
  const value = row[key]
  return typeof value === 'string' ? value.trim() : ''
}

function dateOf(row: { [key: string]: JsonValue }, today: string): string {
  const date = text(row, 'date')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today
}

function wonOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function readExpense(row: { [key: string]: JsonValue }, today: string): UnbiseoExpense {
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
function readFixed(row: { [key: string]: JsonValue }, today: string): UnbiseoFixed {
  const count = row.count
  const route = text(row, 'route')
  return {
    date: dateOf(row, today),
    count: typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= FIXED_COUNT_MAX ? count : 1,
    route: route.length <= ROUTE_NAME_MAX ? route : '',
  }
}

// 거래처 등록 — 이름은 꼭(50자), 그 밖은 서버(24-G-1)와 같은 범위 안일 때만, 아니면 빈 칸.
function readClient(row: { [key: string]: JsonValue }): UnbiseoClient | null {
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

/** 서버가 돌려준 값 → 화면용. 모양이 틀리면 알아듣지 못함. */
export function readAnswer(data: JsonValue | undefined, today: string): UnbiseoResult {
  const row = record(data)
  if (!row) return { kind: 'error', message: NOT_UNDERSTOOD }
  if (row.kind === 'unknown') return { kind: 'unknown' }
  const question = record(row.question)
  if (row.kind === 'question') return question ? { kind: 'question', question: readQuestion(question, today) } : { kind: 'error', message: NOT_UNDERSTOOD }
  const client = record(row.client)
  const clientDraft = row.kind === 'client' && client ? readClient(client) : null
  if (row.kind === 'client') return clientDraft ? { kind: 'client', client: clientDraft } : { kind: 'error', message: NOT_UNDERSTOOD }
  const fixed = record(row.fixed)
  if (row.kind === 'fixed') return fixed ? { kind: 'fixed', fixed: readFixed(fixed, today) } : { kind: 'error', message: NOT_UNDERSTOOD }
  const expense = record(row.expense)
  if (row.kind === 'expense') return expense ? { kind: 'expense', expense: readExpense(expense, today) } : { kind: 'error', message: NOT_UNDERSTOOD }
  const call = record(row.call)
  if (row.kind !== 'call' || !call) return { kind: 'error', message: NOT_UNDERSTOOD }
  return {
    kind: 'call',
    call: {
      date: dateOf(call, today),
      loadLoc: text(call, 'loadLoc'),
      unloadLoc: text(call, 'unloadLoc'),
      fare: wonOf(call.fare),
      client: text(call, 'client'),
    },
  }
}

/** 거래처 이름 — 빈 이름·긴 이름 빼고 겹침 없이 200개까지. */
export function clientNamesForAi(names: Array<string>): Array<string> {
  const out: Array<string> = []
  for (const raw of names) {
    const name = raw.trim()
    if (name && name.length <= CLIENT_NAME_MAX && !out.includes(name)) out.push(name)
    if (out.length >= CLIENTS_MAX) break
  }
  return out
}

/** 등록 노선 → "상차지 → 하차지" 이름(일지 칩과 같은 글자) — 빈 칸·긴 이름 빼고 겹침 없이 30개까지. */
export function routeNamesForAi(presets: Array<{ loadLoc: string, unloadLoc: string }>): Array<string> {
  const out: Array<string> = []
  for (const preset of presets) {
    const name = `${preset.loadLoc} → ${preset.unloadLoc}`
    if (preset.loadLoc && preset.unloadLoc && name.length <= ROUTE_NAME_MAX && !out.includes(name)) out.push(name)
    if (out.length >= ROUTES_MAX) break
  }
  return out
}

function messageForStatus(status: number): string {
  if (status === 401) return LOGIN_NEEDED
  if (status === 400) return BAD_INPUT
  if (status === 502) return NOT_UNDERSTOOD
  return TRY_LATER
}

export async function requestUnbiseoParse(input: { text: string, today: string, clientNames: Array<string>, routeNames?: Array<string> }): Promise<UnbiseoResult> {
  const said = input.text.trim()
  if (!said || said.length > TEXT_MAX) return { kind: 'error', message: BAD_INPUT }
  try {
    const { data, error } = await supabase.functions.invoke('unbiseo-parse', {
      body: { text: said, today: input.today, clientNames: clientNamesForAi(input.clientNames), ...(input.routeNames?.length ? { routeNames: input.routeNames } : {}) },
    })
    if (error) {
      const status = error instanceof FunctionsHttpError && error.context instanceof Response ? error.context.status : 0
      return { kind: 'error', message: messageForStatus(status) }
    }
    return readAnswer(data, input.today)
  } catch {
    return { kind: 'error', message: TRY_LATER }
  }
}
