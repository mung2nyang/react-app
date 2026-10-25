// AI 답 읽기 — 종류마다 칸을 검사해 돌려줄 모양으로. 말에 꼭 있어야 할 단어는 여기서 막는다.
import type { ParseInput } from './grok.ts'
import { readClientDraft } from './clientDraft.ts'
import type { ClientDraft } from './clientDraft.ts'
import { readFixed } from './fixedRoute.ts'
import type { Fixed } from './fixedRoute.ts'
import { readQuestion } from './question.ts'
import { readSmsDraft } from './smsDraft.ts'
import type { SmsDraft } from './smsDraft.ts'
import { readWeatherDraft } from './weatherDraft.ts'
import type { WeatherDraft } from './weatherDraft.ts'
import type { Json, Question } from './question.ts'

type Call = { date: string, loadLoc: string, unloadLoc: string, fare: number | null, client: string }
type Expense = { date: string, type: 'maint' | 'fuel' | 'misc', cost: number | null, name: string, category: string, fuelType: string, payment: string }
type Parsed = { kind: 'call', call: Call } | { kind: 'expense', expense: Expense } | { kind: 'question', question: Question } | { kind: 'fixed', fixed: Fixed } | { kind: 'client', client: ClientDraft } | { kind: 'sms', sms: SmsDraft } | { kind: 'weather', weather: WeatherDraft } | { kind: 'inspection', inspection: { date: string } } | { kind: 'dayOff', dayOff: { date: string, off: boolean } } | { kind: 'unknown' }

const PLACE_MAX = 100
// 앱 domain/expenses.ts 목록과 같게 — 서버는 앱 파일을 못 읽는다.
const MAINT_CATEGORIES = ['엔진/미션', '판금/도장', '소모품', '기타']
const MISC_CATEGORIES = ['통행료', '주차비', '과태료', '기타']
const FUEL_TYPES = ['주유', '요소수', '기타']
const PAYMENTS = ['카드', '현금']

export function record(value: Json | undefined): { [key: string]: Json } | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

export function isDateKey(value: Json | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function place(value: Json | undefined): string {
  return typeof value === 'string' ? value.trim().slice(0, PLACE_MAX) : ''
}

// 앞날(내일·모레)은 오늘로 — 날짜 계산은 AI에 맡기지 않는다.
function dayOf(value: Json | undefined, today: string): string {
  return isDateKey(value) && value <= today ? value : today
}

function won(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

// 거래처는 목록 이름과 같을 때만 그 이름, 아니면 들은 그대로.
function clientOf(value: Json | undefined, input: ParseInput): string {
  const heard = place(value)
  return input.clientNames.find((name) => name.trim() === heard) ?? heard
}

function oneOf(value: Json | undefined, list: Array<string>): string {
  const heard = typeof value === 'string' ? value.trim() : ''
  return list.includes(heard) ? heard : ''
}

// 지출 칸 — 분류·결제는 앱 목록에 있을 때만, 날짜는 운행과 같은 규칙(로드맵 24-C-1).
function readExpense(row: { [key: string]: Json }, today: string): Expense {
  const type = row.expenseType === 'fuel' || row.expenseType === 'misc' ? row.expenseType : 'maint'
  const categories = type === 'maint' ? MAINT_CATEGORIES : type === 'misc' ? MISC_CATEGORIES : []
  return {
    date: dayOf(row.date, today),
    type,
    cost: won(row.cost),
    name: place(row.name),
    category: oneOf(row.category, categories),
    fuelType: type === 'fuel' ? oneOf(row.fuelType, FUEL_TYPES) : '',
    payment: oneOf(row.payment, PAYMENTS),
  }
}

/** AI 답 → 돌려줄 모양. 모양이 틀리면 null(502). */
export function readAiAnswer(raw: string, input: ParseInput): Parsed | null {
  let parsed: Json
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const row = record(parsed)
  if (!row) return null
  if (row.kind === 'expense') return { kind: 'expense', expense: readExpense(row, input.today) }
  if (row.kind === 'question') return { kind: 'question', question: readQuestion(row, input.today, clientOf(row.client, input)) }
  // "문자"가 없는 말은 AI가 문자라 해도 관계없음으로.
  if (row.kind === 'sms') return input.text.includes('문자') ? { kind: 'sms', sms: readSmsDraft(row, input.today, clientOf(row.smsClient, input)) } : { kind: 'unknown' }
  if (row.kind === 'weather') return { kind: 'weather', weather: readWeatherDraft(row, input.today) }
  // "점검"이 없는 말은 AI가 점검표라 해도 관계없음으로.
  if (row.kind === 'inspection') return input.text.includes('점검') ? { kind: 'inspection', inspection: { date: dayOf(row.date, input.today) } } : { kind: 'unknown' }
  // "휴무"나 "쉬"가 없는 말은 AI가 휴무라 해도 관계없음으로.
  if (row.kind === 'dayOff') return /휴무|쉬/.test(input.text) ? { kind: 'dayOff', dayOff: { date: isDateKey(row.date) ? row.date : input.today, off: row.dayOffCancel !== true } } : { kind: 'unknown' }
  if (row.kind === 'fixed') return { kind: 'fixed', fixed: readFixed(row, dayOf(row.date, input.today), input.routeNames) }
  if (row.kind === 'unknown') return { kind: 'unknown' }
  // 이름을 못 알아들은 거래처 등록은 관계없음으로.
  if (row.kind === 'client') {
    const client = readClientDraft(row)
    return client ? { kind: 'client', client } : { kind: 'unknown' }
  }
  if (row.kind !== 'call') return null
  return {
    kind: 'call',
    call: {
      date: dayOf(row.date, input.today),
      loadLoc: place(row.loadLoc),
      unloadLoc: place(row.unloadLoc),
      fare: won(row.fare),
      client: clientOf(row.client, input),
    },
  }
}
