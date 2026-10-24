// 기상청 단기예보에서 그 날 날씨를 받아 요약 — 위치는 동네 격자 번호만 받고 남기지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import GRID from './kmaGrid.json' with { type: 'json' }
import { KmaUnavailableError, kmaDay, kstDate } from './kma.ts'
import type { Json } from './kma.ts'

type Grid = { nx: number, ny: number }
type Input = { date: string, place: string, grid: null } | { date: string, place: '', grid: Grid }
type Row = { sido: string, gu: string, nx: number, ny: number }

const PLACE_MAX = 30
// 기상청 격자 크기(가로 149, 세로 253칸).
const NX_MAX = 149
const NY_MAX = 253
const TRY_LATER = '잠시 뒤 다시 시도해 주세요.'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
// 시·도 줄임말 — 표에는 정식 이름만 있다.
const SIDO_ALIASES: { [sido: string]: Array<string> } = {
  서울특별시: ['서울'], 부산광역시: ['부산'], 대구광역시: ['대구'], 인천광역시: ['인천'], 대전광역시: ['대전'], 울산광역시: ['울산'],
  세종특별자치시: ['세종'], 경기도: ['경기'], 충청북도: ['충북'], 충청남도: ['충남'], 경상북도: ['경북'], 경상남도: ['경남'],
  제주특별자치도: ['제주', '제주도'], 강원특별자치도: ['강원', '강원도'], 전북특별자치도: ['전북', '전라북도'],
  전남광주통합특별시: ['전남', '광주', '전라남도', '광주광역시', '전남광주'],
}
const ROWS: Array<Row> = GRID.flatMap((row) => {
  const [sido, gu, nx, ny] = row
  return typeof sido === 'string' && typeof gu === 'string' && typeof nx === 'number' && typeof ny === 'number' ? [{ sido, gu, nx, ny }] : []
})

function reply(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function isDateKey(value: Json | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function cell(value: Json | undefined, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max ? value : null
}

/** 앱이 보낸 것 — 날짜와 지역 이름·격자 번호 중 하나. 모양이 틀리면 null(400). */
export function readInput(body: Json): Input | null {
  const row = body && typeof body === 'object' && !Array.isArray(body) ? body : null
  if (!row || !isDateKey(row.date)) return null
  const place = typeof row.place === 'string' ? row.place.trim() : ''
  const nx = cell(row.nx, NX_MAX)
  const ny = cell(row.ny, NY_MAX)
  const hasGrid = row.nx !== undefined || row.ny !== undefined
  if (place && !hasGrid && place.length <= PLACE_MAX) return { date: row.date, place, grid: null }
  if (!place && nx !== null && ny !== null) return { date: row.date, place: '', grid: { nx, ny } }
  return null
}

// "평택시"는 "평택"으로도, 줄인 이름이 한 글자면 줄이지 않는다("중구").
function short(name: string): string {
  const cut = name.replace(/[시군구]$/, '')
  return cut.length >= 2 ? cut : name
}

// 일반구("수원시장안구")는 시 이름("수원")으로도 찾는다.
function cityOf(gu: string): string {
  return gu.match(/^(.+?시)(.+구)$/)?.[1] ?? gu
}

function namesOf(row: Row): Array<string> {
  const prefixes = [row.sido, ...(SIDO_ALIASES[row.sido] || [])]
  if (!row.gu) return prefixes
  const city = cityOf(row.gu)
  const part = row.gu.slice(city.length)
  const local = [...new Set([row.gu, short(row.gu), city, short(city), part, short(part), part && short(city) + part].filter(Boolean))]
  return [...local, ...prefixes.flatMap((prefix) => local.map((name) => prefix + name))]
}

/** 지역 이름 → 격자. 시·도와 그 안 시·군·구가 같이 맞으면 시·군·구, 한 시의 일반구들이면 첫 구, 그 밖에 둘 이상이면 null. */
export function gridOf(place: string): Grid | null {
  const said = place.replace(/\s/g, '')
  let hits = ROWS.filter((row) => namesOf(row).includes(said))
  const gus = hits.filter((row) => row.gu)
  if (gus.length && hits.every((row) => row.gu || gus.every((gu) => gu.sido === row.sido))) hits = gus
  const cities = new Set(hits.map((row) => `${row.sido}|${cityOf(row.gu)}`))
  const grids = new Set(hits.map((row) => `${row.nx},${row.ny}`))
  return hits.length && (grids.size === 1 || cities.size === 1) ? { nx: hits[0].nx, ny: hits[0].ny } : null
}

// 로그인 확인은 unbiseo-parse와 같은 방식 — 함수끼리 파일을 나눠 쓸 수 없어 따로 둔다.
async function signedInUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const url = Deno.env.get('SUPABASE_URL')
  const key = publishableKey()
  if (!token || !url || !key) return null
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).auth.getUser(token)
  return error || !data.user ? null : data.user.id
}

function publishableKey(): string | null {
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (anon) return anon
  try {
    const keys: Json = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || 'null')
    const named = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys.default : null
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
  // 오늘·내일·모레만(한국 시각).
  const now = Date.now()
  if (input.date < kstDate(now)) return reply(200, { kind: 'past' })
  if (input.date > kstDate(now, 2)) return reply(200, { kind: 'tooFar' })
  const grid = input.grid ?? gridOf(input.place)
  if (!grid) return reply(200, { kind: 'noPlace' })
  const startedAt = Date.now()
  try {
    const weather = await kmaDay(grid.nx, grid.ny, input.date, now)
    // 끝난 이유·걸린 시간만 — 지역·격자·날씨 내용은 남기지 않는다.
    console.log('[unbiseo-weather] kma', JSON.stringify({ result: 'ok', ms: Date.now() - startedAt }))
    return reply(200, { kind: 'weather', weather })
  } catch (error) {
    console.error('[unbiseo-weather] kma', JSON.stringify({ result: error instanceof KmaUnavailableError ? error.message : 'failed', ms: Date.now() - startedAt }))
    return reply(503, { error: TRY_LATER })
  }
}

Deno.serve(handleRequest)
