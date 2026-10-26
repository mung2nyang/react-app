// 운비서 답 문장을 xAI 목소리(Ara)로 — 로그인한 사람만, 문장 내용은 기록에 안 남기고 글자 수만(로드맵 24-E2).
import { createClient } from 'npm:@supabase/supabase-js@2.112.3'

type Json = string | number | boolean | null | Array<Json> | { [key: string]: Json }

const API_URL = 'https://api.x.ai/v1/tts'
const VOICE_ID = 'ara'
const TEXT_MAX = 300
const TIMEOUT_MS = 15000
// 말소리라 낮은 비트레이트로 — 파일이 작아 휴대폰에서 빨리 받는다.
const OUTPUT_FORMAT = { codec: 'mp3', sample_rate: 24000, bit_rate: 32000 }
const TRY_LATER = '잠시 뒤 다시 시도해 주세요.'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** 앱이 보낸 문장 — 모양이 틀리면 null(400). */
export function readText(body: Json): string | null {
  const row = body && typeof body === 'object' && !Array.isArray(body) ? body : null
  const text = row && typeof row.text === 'string' ? row.text.trim() : ''
  return text && text.length <= TEXT_MAX ? text : null
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

/** xAI 소리 파일. 키 없음·오류·시간 넘김·빈 소리면 null. */
async function askVoice(text: string): Promise<ArrayBuffer | null> {
  const apiKey = Deno.env.get('XAI_API_KEY')
  if (!apiKey) return null
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: VOICE_ID, language: 'ko', output_format: OUTPUT_FORMAT }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error('[unbiseo-voice] ai_unavailable', `status ${response.status}`)
      return null
    }
    const sound = await response.arrayBuffer()
    return sound.byteLength > 0 ? sound : null
  } catch (error) {
    console.error('[unbiseo-voice] ai_unavailable', error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'request failed')
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
  const text = readText(body)
  if (!text) return reply(400, { error: '요청 모양이 맞지 않습니다.' })
  const startedAt = Date.now()
  const sound = await askVoice(text)
  // 비용 세기용 — 글자 수·걸린 시간·성공 여부만, 문장은 남기지 않는다.
  console.log('[unbiseo-voice] tts', JSON.stringify({ chars: text.length, ms: Date.now() - startedAt, ok: !!sound, bytes: sound?.byteLength ?? 0 }))
  if (!sound) return reply(503, { error: TRY_LATER })
  // 앱의 함수 부르기가 소리 파일로 받는 형식(audio/mpeg는 글자로 읽어 깨진다).
  return new Response(sound, { status: 200, headers: { ...CORS, 'Content-Type': 'application/octet-stream' } })
}

Deno.serve(handleRequest)
