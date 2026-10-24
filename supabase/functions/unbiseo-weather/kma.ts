// 기상청 단기예보 부르기와 그 날 묶기 — 키는 비밀값 KMA_API_KEY(공공데이터포털 일반 인증키 Decoding).
export type Json = string | number | boolean | null | Array<Json> | { [key: string]: Json }
export type Sky = 'clear' | 'mostlyCloudy' | 'cloudy'
export type Precip = 'none' | 'rain' | 'rainSnow' | 'snow' | 'shower'
export type DayWeather = { date: string, sky: Sky | null, precip: Precip, min: number | null, max: number | null, pop: number | null }

const API_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
const TIMEOUT_MS = 10000
// 02시 발표의 모레 끝까지(시간마다 열두 가지)가 들어가는 수.
const ROWS = '1000'
const KST_MS = 9 * 3600000
const DAY_MS = 86400000
// 02시 발표는 02:10부터 받을 수 있다 — 조금 여유를 둔다.
const BASE_READY_MINUTES = 2 * 60 + 15
const SKIES: { [code: string]: Sky } = { 1: 'clear', 3: 'mostlyCloudy', 4: 'cloudy' }
const PRECIPS: { [code: string]: Precip } = { 1: 'rain', 2: 'rainSnow', 3: 'snow', 4: 'shower' }

/** 키 없음·기상청 장애·시간 넘김·빈 답 — 잠시 뒤 다시. */
export class KmaUnavailableError extends Error {}

function record(value: Json | undefined): { [key: string]: Json } | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/** 한국 시각 날짜(YYYY-MM-DD), days만큼 옮겨서. */
export function kstDate(now: number, days = 0): string {
  return new Date(now + KST_MS + days * DAY_MS).toISOString().slice(0, 10)
}

/** 쓸 발표 — 02:15 뒤면 오늘 02시, 전이면 어제 23시(둘 다 오늘 최저·최고 기온이 들어 있다). */
export function baseOf(now: number): { date: string, time: string } {
  const kst = new Date(now + KST_MS)
  const ready = kst.getUTCHours() * 60 + kst.getUTCMinutes() >= BASE_READY_MINUTES
  return ready ? { date: kstDate(now).replaceAll('-', ''), time: '0200' } : { date: kstDate(now, -1).replaceAll('-', ''), time: '2300' }
}

// 해상 마스킹(-999 등)·숫자 아님은 버린다.
function numberOf(value: Json | undefined): number | null {
  const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN
  return Number.isFinite(number) && Math.abs(number) < 900 ? number : null
}

// 가장 많이 나온 코드, 같으면 큰 코드(더 흐리거나 궂은 쪽).
function mostOf(codes: Array<number>): number | null {
  const counts = new Map<number, number>()
  codes.forEach((code) => counts.set(code, (counts.get(code) || 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null
}

/** 그 날 예보 줄 → 하늘·비눈·최저·최고(없으면 시간별 기온에서)·가장 높은 강수 확률. 줄이 없으면 null. */
export function summarizeDay(items: Array<Json>, date: string): DayWeather | null {
  const day = date.replaceAll('-', '')
  const values = (category: string) => items.flatMap((item) => {
    const row = record(item)
    const value = row && row.fcstDate === day && row.category === category ? numberOf(row.fcstValue) : null
    return value === null ? [] : [value]
  })
  const temps = values('TMP')
  if (!temps.length) return null
  const sky = mostOf(values('SKY'))
  const precip = mostOf(values('PTY').filter((code) => code !== 0))
  const pops = values('POP')
  const min = values('TMN')[0] ?? Math.min(...temps)
  const max = values('TMX')[0] ?? Math.max(...temps)
  return {
    date,
    sky: sky === null ? null : SKIES[sky] ?? null,
    precip: precip === null ? 'none' : PRECIPS[precip] ?? 'none',
    min: Math.round(min),
    max: Math.round(max),
    pop: pops.length ? Math.max(...pops) : null,
  }
}

/** 격자 한 곳의 그 날 날씨. 실패는 KmaUnavailableError(끝난 이유만 담는다). */
export async function kmaDay(nx: number, ny: number, date: string, now: number): Promise<DayWeather> {
  const key = Deno.env.get('KMA_API_KEY')
  if (!key) throw new KmaUnavailableError('no key')
  const base = baseOf(now)
  const query = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: ROWS, dataType: 'JSON', base_date: base.date, base_time: base.time, nx: String(nx), ny: String(ny) })
  let response: Response
  try {
    response = await fetch(`${API_URL}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    throw new KmaUnavailableError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'request failed')
  }
  if (!response.ok) throw new KmaUnavailableError(`status ${response.status}`)
  let answer: Json
  try {
    answer = await response.json()
  } catch {
    // 키가 틀리면 JSON을 달라 해도 XML 오류가 온다.
    throw new KmaUnavailableError('not json')
  }
  const body = record(record(answer)?.response)
  const code = record(body?.header)?.resultCode
  if (code !== '00') throw new KmaUnavailableError(`code ${typeof code === 'string' ? code : '?'}`)
  const items = record(record(body?.body)?.items)?.item
  const weather = Array.isArray(items) ? summarizeDay(items, date) : null
  if (!weather) throw new KmaUnavailableError('no data')
  return weather
}
