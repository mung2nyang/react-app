// 운비서 서버 함수(unbiseo-parse) 부르기 — 저장 없음, 실패는 쉬운 문구로(로드맵 24-B).
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { JsonValue } from '../../../domain/jsonTypes.ts'
import { supabase } from '../../../data/cloud/supabaseClient.ts'
import { readQuestion } from './unbiseoQuestion.ts'
import { readSms } from './unbiseoSms.ts'
import type { UnbiseoSms } from './unbiseoSms.ts'
import type { UnbiseoQuestion } from './unbiseoQuestion.ts'
import { CLIENT_NAME_MAX, ROUTE_NAME_MAX, dateOf, readClient, readDayOff, readExpense, readFixed, readWeather, record, text, wonOf } from './unbiseoFields.ts'
import type { UnbiseoClient, UnbiseoDayOff, UnbiseoExpense, UnbiseoFixed, UnbiseoWeather } from './unbiseoFields.ts'
export type { UnbiseoClient, UnbiseoDayOff, UnbiseoExpense, UnbiseoFixed, UnbiseoWeather } from './unbiseoFields.ts'

export const TEXT_MAX = 300
const CLIENTS_MAX = 200
const ROUTES_MAX = 30

export type UnbiseoCall = { date: string, loadLoc: string, unloadLoc: string, fare: number | null, client: string }
/** [기록하기]·[등록하기]·휴무 버튼으로 넘기는 것 — 운행·지출·고정 노선·휴무는 일지로, 거래처는 거래처 화면으로 */
export type UnbiseoRecord = UnbiseoCall | UnbiseoExpense | UnbiseoFixed | UnbiseoClient | UnbiseoDayOff
export type UnbiseoResult =
  | { kind: 'call', call: UnbiseoCall }
  | { kind: 'expense', expense: UnbiseoExpense }
  | { kind: 'fixed', fixed: UnbiseoFixed }
  | { kind: 'client', client: UnbiseoClient }
  | { kind: 'sms', sms: UnbiseoSms }
  | { kind: 'weather', weather: UnbiseoWeather }
  | { kind: 'inspection', inspection: { date: string } }
  | { kind: 'dayOff', dayOff: UnbiseoDayOff }
  | { kind: 'question', question: UnbiseoQuestion }
  | { kind: 'unknown' }
  | { kind: 'error', message: string }

export const LOGIN_NEEDED = '로그인이 필요합니다.'
export const BAD_INPUT = '입력 내용이 너무 길거나 비어 있어요. 300자 이내로 다시 입력해 주세요.'
export const NOT_UNDERSTOOD = '내용을 이해하지 못했어요. 다시 말씀해 주세요.'
export const TRY_LATER = '잠시 뒤 다시 시도해 주세요.'

/** 서버가 돌려준 값 → 화면용. 모양이 틀리면 알아듣지 못함. */
export function readAnswer(data: JsonValue | undefined, today: string): UnbiseoResult {
  const row = record(data)
  if (!row) return { kind: 'error', message: NOT_UNDERSTOOD }
  if (row.kind === 'unknown') return { kind: 'unknown' }
  const question = record(row.question)
  if (row.kind === 'question') return question ? { kind: 'question', question: readQuestion(question, today) } : { kind: 'error', message: NOT_UNDERSTOOD }
  const sms = record(row.sms)
  if (row.kind === 'sms') return sms ? { kind: 'sms', sms: readSms(sms) } : { kind: 'error', message: NOT_UNDERSTOOD }
  const weather = record(row.weather)
  if (row.kind === 'weather') return weather ? { kind: 'weather', weather: readWeather(weather, today) } : { kind: 'error', message: NOT_UNDERSTOOD }
  const dayOff = record(row.dayOff)
  const dayOffDraft = row.kind === 'dayOff' && dayOff ? readDayOff(dayOff, today) : null
  if (row.kind === 'dayOff') return dayOffDraft ? { kind: 'dayOff', dayOff: dayOffDraft } : { kind: 'error', message: NOT_UNDERSTOOD }
  const inspection = record(row.inspection)
  if (row.kind === 'inspection') return inspection ? { kind: 'inspection', inspection: { date: dateOf(inspection, today) } } : { kind: 'error', message: NOT_UNDERSTOOD }
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
