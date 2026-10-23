// 운비서 서버 함수(unbiseo-parse) 부르기 — 저장 없음, 실패는 쉬운 문구로(로드맵 24-B).
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { JsonValue } from '../../../domain/jsonTypes.ts'
import { formatWon } from '../../../domain/money.ts'
import { supabase } from '../../../data/cloud/supabaseClient.ts'

export const TEXT_MAX = 300
const CLIENTS_MAX = 200
const CLIENT_NAME_MAX = 50

export type UnbiseoCall = { date: string, loadLoc: string, unloadLoc: string, fare: number | null, client: string }
export type UnbiseoExpense = { date: string, type: 'maint' | 'fuel' | 'misc', cost: number | null, name: string, category: string, fuelType: string, payment: string }
/** [기록하기]로 일지에 넘기는 것 — 운행 또는 지출 */
export type UnbiseoRecord = UnbiseoCall | UnbiseoExpense
export type UnbiseoResult =
  | { kind: 'call', call: UnbiseoCall }
  | { kind: 'expense', expense: UnbiseoExpense }
  | { kind: 'question' }
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

/** 서버가 돌려준 값 → 화면용. 모양이 틀리면 알아듣지 못함. */
export function readAnswer(data: JsonValue | undefined, today: string): UnbiseoResult {
  const row = record(data)
  if (!row) return { kind: 'error', message: NOT_UNDERSTOOD }
  if (row.kind === 'question' || row.kind === 'unknown') return { kind: row.kind }
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

/** 받침 있으면 "으로", 없거나 ㄹ 받침·한글 아님이면 "로". */
function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}로`
  const final = code % 28
  return final === 0 || final === 8 ? `${word}로` : `${word}으로`
}

function dateLabelOf(date: string, today: string): string {
  const [, month, day] = date.split('-').map(Number)
  return date === today ? '오늘' : `${month}월 ${day}일`
}

/** 운행 결과 한 문장 — 앱이 정해진 틀로 만든다(빈 칸은 뺌). */
export function describeCall(call: UnbiseoCall, today: string): string {
  const dateLabel = dateLabelOf(call.date, today)
  const route = [call.loadLoc, call.unloadLoc].filter(Boolean).join(' → ')
  const parts = [route, call.fare === null ? '' : formatWon(call.fare), call.client].filter(Boolean)
  if (!parts.length) return `${dateLabel} 운행으로 기록할게요.`
  return `${dateLabel} ${withRo(parts.join(', '))} 기록할게요.`
}

const EXPENSE_LABEL = { maint: '정비', fuel: '주유', misc: '기타' }

/** 지출 결과 한 문장 — 항목은 주유면 주유 종류, 그 밖은 항목명 → 분류 → 종류 이름 순(빈 칸은 뺌). */
export function describeExpense(expense: UnbiseoExpense, today: string): string {
  const item = expense.type === 'fuel' ? expense.fuelType || '주유' : expense.name || expense.category || EXPENSE_LABEL[expense.type]
  const parts = [item, expense.cost === null ? '' : formatWon(expense.cost), expense.payment].filter(Boolean)
  return `${dateLabelOf(expense.date, today)} ${withRo(parts.join(', '))} 기록할게요.`
}

/** 결과 한 문장(운행·지출·질문·관계없음·실패). */
export function describeResult(result: UnbiseoResult, today: string): string {
  if (result.kind === 'call') return describeCall(result.call, today)
  if (result.kind === 'expense') return describeExpense(result.expense, today)
  if (result.kind === 'question') return '질문 답하기는 곧 할 수 있게 됩니다.'
  if (result.kind === 'unknown') return '운행 기록으로 알아듣지 못했어요. 다시 말해 주세요.'
  return result.message
}

function messageForStatus(status: number): string {
  if (status === 401) return LOGIN_NEEDED
  if (status === 400) return BAD_INPUT
  if (status === 502) return NOT_UNDERSTOOD
  return TRY_LATER
}

export async function requestUnbiseoParse(input: { text: string, today: string, clientNames: Array<string> }): Promise<UnbiseoResult> {
  const said = input.text.trim()
  if (!said || said.length > TEXT_MAX) return { kind: 'error', message: BAD_INPUT }
  try {
    const { data, error } = await supabase.functions.invoke('unbiseo-parse', {
      body: { text: said, today: input.today, clientNames: clientNamesForAi(input.clientNames) },
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
