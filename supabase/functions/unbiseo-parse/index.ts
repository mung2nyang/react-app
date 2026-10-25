// 운비서: 말한 문장을 일지 칸(운행·지출·질문)으로 나눈다(로드맵 24-A). 로그인한 사람만, 저장·계산은 안 하고 말한 내용은 로그에 남기지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { AiUnavailableError, askAi } from './grok.ts'
import type { ParseInput } from './grok.ts'
import { readRouteNames } from './fixedRoute.ts'
import { isDateKey, readAiAnswer, record } from './answer.ts'
import type { Json } from './question.ts'

const TEXT_MAX = 300
const CLIENTS_MAX = 200
const CLIENT_NAME_MAX = 50
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
