// AI 회사(Google Gemini) 부르기만 — 회사를 바꿀 땐 이 파일과 비밀값만 바꾼다(로드맵 24-A).
import { ApiError, GoogleGenAI, ThinkingLevel } from 'npm:@google/genai@2.27.0'

// 2026-10-22 무료 구간이 있는 Flash-Lite 최신 정식판.
const MODEL = 'gemini-3.5-flash-lite'
const TIMEOUT_MS = 15000

/** 키 없음·AI 회사 장애 — 잠시 뒤 다시. */
export class AiUnavailableError extends Error {}

export type ParseInput = { text: string, today: string, clientNames: Array<string> }

const INSTRUCTION = [
  '너는 화물차 기사의 운행일지 앱 비서다. 기사가 말한 한국어 문장 하나를 받아 종류와 칸을 JSON으로만 돌려준다.',
  'kind: 운행(상차지·하차지·운송료·거래처를 말함)은 call, 기름값·수리비 같은 돈 쓴 일은 expense, 매출·기록을 묻는 말은 question, 그 밖은 unknown.',
  'call일 때만 나머지 칸을 채운다. date는 YYYY-MM-DD — "어제", "그제", "지난 금요일" 같은 말이 있으면 오늘 날짜로 계산하고, 없으면 오늘.',
  'loadLoc은 상차지(출발), unloadLoc은 하차지(도착) — 들은 지명 그대로. "A에서 B"면 A가 상차지, B가 하차지.',
  'fare는 원 단위 정수("30만원"은 300000, "15만"은 150000, "8만 5천"은 85000). 말하지 않았으면 빼라.',
  'client는 거래처 목록에 같은 이름이 있으면 그 이름 그대로, 없으면 들은 그대로, 말하지 않았으면 빼라. 지어내지 마라.',
].join('\n')

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
  const prompt = `오늘: ${input.today}\n거래처 목록: ${input.clientNames.join(', ') || '(없음)'}\n기사가 한 말: ${input.text}`
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
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    })
    return response.text || null
  } catch (error) {
    if (error instanceof ApiError) throw new AiUnavailableError(`status ${error.status}`)
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return null
    throw new AiUnavailableError('request failed')
  }
}
