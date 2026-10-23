// 운비서: 말한 문장을 일지 칸(운행·지출·질문)으로 나눈다(로드맵 24-A). 로그인한 사람만, 저장·계산은 안 하고 말한 내용은 로그에 남기지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { AiUnavailableError, askAi } from './grok.ts'
import type { ParseInput } from './grok.ts'
import { readFixed, readRouteNames } from './fixedRoute.ts'
import type { Fixed } from './fixedRoute.ts'
import { readQuestion } from './question.ts'
import type { Json, Question } from './question.ts'

type Call = { date: string, loadLoc: string, unloadLoc: string, fare: number | null, client: string }
type Expense = { date: string, type: 'maint' | 'fuel' | 'misc', cost: number | null, name: string, category: string, fuelType: string, payment: string }
type Parsed = { kind: 'call', call: Call } | { kind: 'expense', expense: Expense } | { kind: 'question', question: Question } | { kind: 'fixed', fixed: Fixed } | { kind: 'unknown' }

const TEXT_MAX = 300
const CLIENTS_MAX = 200
const CLIENT_NAME_MAX = 50
const PLACE_MAX = 100
// 앱 domain/expenses.ts 목록과 같게 — 서버는 앱 파일을 못 읽는다.
const MAINT_CATEGORIES = ['엔진/미션', '판금/도장', '소모품', '기타']
const MISC_CATEGORIES = ['통행료', '주차비', '과태료', '기타']
const FUEL_TYPES = ['주유', '요소수', '기타']
const PAYMENTS = ['카드', '현금']
const NOT_UNDERSTOOD = '알아듣지 못했습니다. 다시 말해 주세요.'
const TRY_LATER = '잠시 뒤 다시 시도해 주세요.'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function record(value: Json | undefined): { [key: string]: Json } | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function isDateKey(value: Json | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/** 앱이 보낸 것 — 모양이 틀리면 null(400). */
export function readInput(body: Json): ParseInput | null {
  const row = record(body)
  if (!row) return null
  const text = typeof row.text === 'string' ? row.text.trim() : ''
  if (!text || text.length > TEXT_MAX || !isDateKey(row.today)) return null
  const names = row.clientNames
  if (!Array.isArray(names) || names.length > CLIENTS_MAX) return null
  const clientNames: Array<string> = []
  for (const name of names) {
    if (typeof name !== 'string' || name.length > CLIENT_NAME_MAX) return null
    clientNames.push(name)
  }
  const routeNames = readRouteNames(row.routeNames)
  if (!routeNames) return null
  return { text, today: row.today, clientNames, routeNames }
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
  if (row.kind === 'fixed') return { kind: 'fixed', fixed: readFixed(row, dayOf(row.date, input.today), input.routeNames) }
  if (row.kind === 'unknown') return { kind: 'unknown' }
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

/** 요청 머리의 로그인 표로 Supabase에 누구인지 묻는다. 앱 공개 키만으로는 사용자가 없어 null. */
async function signedInUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const url = Deno.env.get('SUPABASE_URL')
  const key = publishableKey()
  if (!token || !url || !key) return null
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).auth.getUser(token)
  return error || !data.user ? null : data.user.id
}

/** 함수 기본 값의 공개 키 — SUPABASE_ANON_KEY, 없으면 새 이름(SUPABASE_PUBLISHABLE_KEYS의 default). */
function publishableKey(): string | null {
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (anon) return anon
  try {
    const keys: Json = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || 'null')
    const named = record(keys)?.default
    return typeof named === 'string' && named ? named : null
  } catch {
    return null
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: '지원하지 않는 요청입니다.' })
  if (!(await signedInUserId(req))) return reply(401, { error: '로그인이 필요합니다.' })
  let body: Json
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: '요청 모양이 맞지 않습니다.' })
  }
  const input = readInput(body)
  if (!input) return reply(400, { error: '요청 모양이 맞지 않습니다.' })
  try {
    const raw = await askAi(input)
    const answer = raw === null ? null : readAiAnswer(raw, input)
    if (!answer) {
      console.error('[unbiseo-parse] not_understood')
      return reply(502, { error: NOT_UNDERSTOOD })
    }
    return reply(200, answer)
  } catch (error) {
    console.error('[unbiseo-parse]', error instanceof AiUnavailableError ? `ai_unavailable ${error.message}` : 'failed')
    return reply(503, { error: TRY_LATER })
  }
}

Deno.serve(handleRequest)
