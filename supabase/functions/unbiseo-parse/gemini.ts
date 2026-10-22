// AI 회사(Google Gemini) 부르기만 — 회사를 바꿀 땐 이 파일과 비밀값만 바꾼다(로드맵 24-A).
import { ApiError, GoogleGenAI, ThinkingLevel } from 'npm:@google/genai@2.27.0'

// 2026-10-22 3.5 Flash-Lite 무료 구간이 계속 시간 넘김이라 3.1 Flash-Lite로(보리 결정, 2.5는 API에 없음).
const MODEL = 'gemini-3.1-flash-lite'
const TIMEOUT_MS = 15000
// 답이 끝없이 길어지는 걸 막는 상한 — 칸 다섯 개면 충분하다.
const MAX_OUTPUT_TOKENS = 300

/** 키 없음·AI 회사 장애 — 잠시 뒤 다시. */
export class AiUnavailableError extends Error {}

export type ParseInput = { text: string, today: string, clientNames: Array<string> }

const INSTRUCTION = [
  '너는 화물차 기사의 운행일지 앱 비서다. 기사가 말한 한국어 문장 하나를 받아 종류와 칸을 JSON으로만 돌려준다.',
  'kind: 운행은 call, 기름값·수리비·타이어 같은 돈 쓴 일은 expense, 매출·기록·일지를 묻는 말은 question, 그 밖(날씨·인사·잡담)은 unknown.',
  '지명 두 개가 나오면 "에서"가 없어도 운행이다. 예: "어제 수원 화성 15만" → call, 수원→화성, 150000.',
  '날씨·뉴스·잡담은 물음표가 있어도 question이 아니라 unknown이다. 예: "오늘 날씨 어때" → unknown.',
  'call일 때만 나머지 칸을 채운다. date는 아래 "날짜 표"에서 그대로 골라 YYYY-MM-DD로 — 직접 계산하지 마라. 날짜 말이 없거나 내일·모레 같은 앞날이면 오늘.',
  '"10월 15일"처럼 월·일만 말하면 올해 그 날짜. "지난주 금요일"은 지난주 줄, "지난 월요일"은 오늘 전에 가장 가까운 그 요일 줄, "이번 주 화요일"은 이번 주 줄.',
  'loadLoc은 상차지(출발), unloadLoc은 하차지(도착) — 들은 지명 그대로. 먼저 말한 지명이 상차지, 다음이 하차지.',
  'fare는 원 단위 정수("30만원"은 300000, "15만"은 150000, "8만 5천"은 85000). 말하지 않았으면 빼라.',
  'client는 거래처 목록에서 가장 맞는 이름 그대로 — 줄임말·발음도 목록 이름으로(예: "씨제이"·"CJ" → 목록의 "CJ대한통운"). 목록에 없으면 들은 그대로, 말하지 않았으면 빼라. 지어내지 마라.',
].join('\n')

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const DAY_MS = 86400000

function dateKeyOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

// 날짜 계산은 AI가 못 해서 여기서 미리 계산한 표를 같이 준다.
export function dateTable(today: string): string {
  const base = Date.parse(`${today}T00:00:00Z`)
  const weekday = new Date(base).getUTCDay()
  const label = (time: number) => `${dateKeyOf(time)}(${WEEKDAYS[new Date(time).getUTCDay()]})`
  const lines = [`오늘: ${label(base)}`, `어제: ${label(base - DAY_MS)}`, `그제(그저께): ${label(base - 2 * DAY_MS)}`]
  for (let n = 3; n <= 6; n += 1) lines.push(`${n}일 전: ${label(base - n * DAY_MS)}`)
  // 한 주는 월요일부터 일요일까지.
  const monday = base - ((weekday + 6) % 7) * DAY_MS
  const week = (start: number) => WEEKDAYS.slice(1).concat(WEEKDAYS[0]).map((name, i) => `${name} ${dateKeyOf(start + i * DAY_MS)}`).join(', ')
  lines.push(`이번 주: ${week(monday)}`, `지난주: ${week(monday - 7 * DAY_MS)}`)
  const recent = WEEKDAYS.map((name, day) => `${name} ${dateKeyOf(base - (((weekday - day + 6) % 7) + 1) * DAY_MS)}`)
  lines.push(`지난 ○요일(오늘 전에 가장 가까운): ${recent.join(', ')}`)
  return lines.join('\n')
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['call', 'expense', 'question', 'unknown'] },
    date: { type: 'string', description: 'YYYY-MM-DD' },
    loadLoc: { type: 'string' },
    unloadLoc: { type: 'string' },
    fare: { type: 'integer', description: '원 단위' },
    client: { type: 'string' },
  },
  required: ['kind'],
}

/** AI가 돌려준 JSON 글자. 거절·빈 답·시간 넘김이면 null(알아듣지 못함). */
export async function askAi(input: ParseInput): Promise<string | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new AiUnavailableError('no key')
  const ai = new GoogleGenAI({ apiKey })
  const prompt = `날짜 표:\n${dateTable(input.today)}\n거래처 목록: ${input.clientNames.join(', ') || '(없음)'}\n기사가 한 말: ${input.text}`
  const startedAt = Date.now()
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction: INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    })
    const finish = String(response.candidates?.[0]?.finishReason ?? '')
    // 원인 확인용 — 끝난 이유·쓴 양·걸린 시간만, 말한 문장과 답 내용은 남기지 않는다.
    console.log('[unbiseo-parse] ai', JSON.stringify({
      finish,
      out: response.usageMetadata?.candidatesTokenCount ?? null,
      think: response.usageMetadata?.thoughtsTokenCount ?? null,
      ms: Date.now() - startedAt,
    }))
    if (finish === 'MAX_TOKENS') return null
    return response.text || null
  } catch (error) {
    if (error instanceof ApiError) throw new AiUnavailableError(`status ${error.status}`)
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      console.log('[unbiseo-parse] ai', JSON.stringify({ finish: 'TIMEOUT', ms: Date.now() - startedAt }))
      return null
    }
    throw new AiUnavailableError('request failed')
  }
}
