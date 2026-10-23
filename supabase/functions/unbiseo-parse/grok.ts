// AI 회사(xAI Grok) 부르기만 — 회사를 바꿀 땐 이 파일과 비밀값만 바꾼다(로드맵 24-A2, 2026-10-23 Gemini 무료 구간 503이 잦아 바꿈).
const API_URL = 'https://api.x.ai/v1/chat/completions'
const MODEL = 'grok-4.20-0309-non-reasoning'
const TIMEOUT_MS = 15000
// 답이 끝없이 길어지는 걸 막는 상한 — 칸 열한 개라도 충분하다.
const MAX_OUTPUT_TOKENS = 300

/** 키 없음·AI 회사 장애 — 잠시 뒤 다시. */
export class AiUnavailableError extends Error {}

export type ParseInput = { text: string, today: string, clientNames: Array<string> }

const INSTRUCTION = [
  '너는 화물차 기사의 운행일지 앱 비서다. 기사가 말한 한국어 문장 하나를 받아 종류와 칸을 JSON으로만 돌려준다.',
  'kind: 운행은 call, 기름값·수리비·타이어·통행료 같은 돈 쓴 일은 expense, 매출·기록·일지를 묻는 말은 question, 그 밖(날씨·인사·잡담)은 unknown.',
  '지명 두 개가 나오면 "에서"가 없어도 운행이다. 예: "어제 수원 화성 15만" → call, 수원→화성, 150000.',
  '날씨·뉴스·잡담은 물음표가 있어도 question이 아니라 unknown이다. 예: "오늘 날씨 어때" → unknown.',
  'call·expense일 때만 나머지 칸을 채운다. date는 아래 "날짜 표"에서 그대로 골라 YYYY-MM-DD로 — 직접 계산하지 마라. 날짜 말이 없거나 내일·모레 같은 앞날이면 오늘.',
  '"10월 15일"처럼 월·일만 말하면 올해 그 날짜. "지난주 금요일"은 지난주 줄, "지난 월요일"은 오늘 전에 가장 가까운 그 요일 줄, "이번 주 화요일"은 이번 주 줄.',
  'loadLoc은 상차지(출발), unloadLoc은 하차지(도착) — 들은 지명 그대로. 먼저 말한 지명이 상차지, 다음이 하차지.',
  'fare는 원 단위 정수("30만원"은 300000, "15만"은 150000, "8만 5천"은 85000). 말하지 않았으면 빼라.',
  'client는 거래처 목록에서 가장 맞는 이름 그대로 — 줄임말·발음도 목록 이름으로(예: "씨제이"·"CJ" → 목록의 "CJ대한통운"). 목록에 없으면 들은 그대로, 말하지 않았으면 빼라. 지어내지 마라.',
  'expenseType: 정비·수리·타이어·오일·부품은 maint, 주유·경유·기름·요소수는 fuel, 통행료·톨게이트·주차·과태료는 misc.',
  'cost는 쓴 돈(fare와 같은 원 단위 정수). name은 들은 항목 그대로(예: "타이어 교체", "엔진오일 교환").',
  'category는 maint면 엔진/미션·판금/도장·소모품·기타 중, misc면 통행료·주차비·과태료·기타 중 하나 — 맞는 게 없으면 null. fuelType은 fuel일 때만 주유·요소수·기타 중 하나. payment는 "카드"나 "현금"이라고 말했을 때만.',
  '예: "어제 경유 12만원 넣었어" → expense, fuel, 어제 날짜, cost 120000, fuelType 주유. "엔진오일 교환 15만원 현금" → expense, maint, name 엔진오일 교환, category 소모품, cost 150000, payment 현금. "통행료 5천원" → expense, misc, name 통행료, category 통행료, cost 5000.',
  'call이면 지출 칸(expenseType·cost·name·category·fuelType·payment)은 null, expense면 운행 칸(loadLoc·unloadLoc·fare·client)은 null.',
  '말하지 않은 칸은 null — 운송료·금액 0이나 목록 거래처·분류로 채우지 마라.',
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

// 모든 칸을 필수로 두고 null을 허용 — 말하지 않은 칸은 AI가 null을 골라 비운다.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['call', 'expense', 'question', 'unknown'] },
    date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    loadLoc: { type: ['string', 'null'] },
    unloadLoc: { type: ['string', 'null'] },
    fare: { type: ['integer', 'null'], description: '원 단위' },
    client: { type: ['string', 'null'] },
    expenseType: { type: ['string', 'null'], enum: ['maint', 'fuel', 'misc', null] },
    cost: { type: ['integer', 'null'], description: '원 단위' },
    name: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    fuelType: { type: ['string', 'null'] },
    payment: { type: ['string', 'null'] },
  },
  required: ['kind', 'date', 'loadLoc', 'unloadLoc', 'fare', 'client', 'expenseType', 'cost', 'name', 'category', 'fuelType', 'payment'],
}

type ChatAnswer = {
  choices?: Array<{ finish_reason?: string | null, message?: { content?: string | null } }>
  usage?: { completion_tokens?: number }
}

/** AI가 돌려준 JSON 글자. 길이 초과·빈 답·시간 넘김이면 null(알아듣지 못함). */
export async function askAi(input: ParseInput): Promise<string | null> {
  const apiKey = Deno.env.get('XAI_API_KEY')
  if (!apiKey) throw new AiUnavailableError('no key')
  const prompt = `날짜 표:\n${dateTable(input.today)}\n거래처 목록: ${input.clientNames.join(', ') || '(없음)'}\n기사가 한 말: ${input.text}`
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: INSTRUCTION }, { role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'unbiseo_parse', schema: RESPONSE_SCHEMA, strict: true } },
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      console.log('[unbiseo-parse] ai', JSON.stringify({ finish: 'TIMEOUT', ms: Date.now() - startedAt }))
      return null
    }
    throw new AiUnavailableError('request failed')
  }
  if (!response.ok) throw new AiUnavailableError(`status ${response.status}`)
  let answer: ChatAnswer
  try {
    answer = await response.json()
  } catch {
    return null
  }
  const choice = answer.choices?.[0]
  const finish = String(choice?.finish_reason ?? '')
  // 원인 확인용 — 끝난 이유·쓴 양·걸린 시간만, 말한 문장과 답 내용은 남기지 않는다.
  console.log('[unbiseo-parse] ai', JSON.stringify({
    finish,
    out: answer.usage?.completion_tokens ?? null,
    ms: Date.now() - startedAt,
  }))
  if (finish === 'length') return null
  return choice?.message?.content || null
}
