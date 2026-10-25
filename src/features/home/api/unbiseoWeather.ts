// 운비서 날씨 — 지역 이름이나 휴대폰 위치(동네 격자 번호만)로 unbiseo-weather를 불러 앱 틀 문장으로.
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { JsonValue } from '../../../domain/jsonTypes.ts'
import { supabase } from '../../../data/cloud/supabaseClient.ts'
import { kmaGridOf } from './kmaGrid.ts'
import type { KmaGrid } from './kmaGrid.ts'
import { LOGIN_NEEDED, TRY_LATER } from './unbiseoParse.ts'
import type { UnbiseoWeather } from './unbiseoParse.ts'
import { withParticle } from './unbiseoSentence.ts'

type Sky = 'clear' | 'mostlyCloudy' | 'cloudy'
type Precip = 'rain' | 'rainSnow' | 'snow' | 'shower'
type DayWeather = { sky: Sky | null, precip: Precip | null, min: number | null, max: number | null, pop: number | null }

export const WEATHER_PAST = '과거 날씨는 안내하지 않아요.'
export const WEATHER_TOO_FAR = '날씨는 모레까지 확인할 수 있어요.'
export const NO_LOCATION = '위치 정보 사용을 허용하거나 지역명을 말해 주세요.'
const LOCATION_TIMEOUT_MS = 10000
const LOCATION_MAX_AGE_MS = 600000
const DAY_LABELS = ['오늘', '내일', '모레']
// "맑음"과 비·눈이 같이 오면 "맑고 비"처럼 이어 쓴다.
const SKY_WORDS: { [sky in Sky]: [string, string] } = { clear: ['맑음', '맑고'], mostlyCloudy: ['구름 많음', '구름 많고'], cloudy: ['흐림', '흐리고'] }
const PRECIP_WORDS: { [precip in Precip]: string } = { rain: '비', rainSnow: '비나 눈', snow: '눈', shower: '소나기' }

function record(value: JsonValue | undefined): { [key: string]: JsonValue } | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/** 오늘에서 며칠 뒤인지(지난 날은 음수). */
function daysFrom(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
}

/** 오늘·내일·모레 밖이면 그 문장, 안이면 null — 이때는 위치도 서버도 쓰지 않는다. */
export function weatherRangeSentence(date: string, today: string): string | null {
  const days = daysFrom(today, date)
  if (days < 0) return WEATHER_PAST
  return days > 2 ? WEATHER_TOO_FAR : null
}

/** 휴대폰 위치 → 격자 번호. 거절·10초 넘김·지원 안 함·나라 밖이면 null. 좌표는 여기서 버린다. */
export function currentGrid(): Promise<KmaGrid | null> {
  const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation
  if (!geo) return Promise.resolve(null)
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => resolve(kmaGridOf(position.coords.latitude, position.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT_MS, maximumAge: LOCATION_MAX_AGE_MS },
    )
  })
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readDay(row: { [key: string]: JsonValue }): DayWeather {
  const sky = row.sky === 'clear' || row.sky === 'mostlyCloudy' || row.sky === 'cloudy' ? row.sky : null
  const precip = row.precip === 'rain' || row.precip === 'rainSnow' || row.precip === 'snow' || row.precip === 'shower' ? row.precip : null
  const pop = numberOf(row.pop)
  return { sky, precip, min: numberOf(row.min), max: numberOf(row.max), pop: pop !== null && pop >= 0 && pop <= 100 ? pop : null }
}

/** "오늘 평택 날씨는 흐리고 비, 18~23도, 비 올 확률 60%예요." — 서버가 주지 않은 칸은 뺀다. */
export function describeWeather(day: DayWeather, weather: UnbiseoWeather, today: string): string {
  const where = weather.place ? `${weather.place} 날씨는` : '지금 있는 곳 날씨는'
  const skyWord = day.sky ? SKY_WORDS[day.sky] : null
  const precip = day.precip ? PRECIP_WORDS[day.precip] : ''
  const look = precip ? [skyWord?.[1], precip].filter(Boolean).join(' ') : skyWord?.[0] ?? ''
  const temps = day.min !== null && day.max !== null ? `최저 ${day.min}도, 최고 ${day.max}도` : day.min !== null ? `최저 ${day.min}도` : day.max !== null ? `최고 ${day.max}도` : ''
  const parts = [look, temps, day.pop === null ? '' : `비 올 확률 ${day.pop}%`].filter(Boolean)
  const head = `${DAY_LABELS[daysFrom(today, weather.date)] ?? ''} ${where}`.trim()
  if (!parts.length) return TRY_LATER
  return `${head} ${withParticle(parts.join(', '), '이에요', '예요')}.`
}

function sentenceOf(data: JsonValue | undefined, weather: UnbiseoWeather, today: string): string {
  const row = record(data)
  const day = record(row?.weather)
  if (row?.kind === 'weather' && day) return describeWeather(readDay(day), weather, today)
  if (row?.kind === 'past') return WEATHER_PAST
  if (row?.kind === 'tooFar') return WEATHER_TOO_FAR
  if (row?.kind === 'noPlace' && weather.place) return `${weather.place} 지역을 찾지 못했어요. 시, 군, 구 이름을 말해 주세요.`
  return TRY_LATER
}

/** 날씨 한 문장 — 범위 밖이면 바로, 지역이 없으면 휴대폰 위치(격자 번호만 보냄)로. */
export async function requestWeatherSentence(weather: UnbiseoWeather, today: string): Promise<string> {
  const range = weatherRangeSentence(weather.date, today)
  if (range) return range
  const grid = weather.place ? null : await currentGrid()
  if (!weather.place && !grid) return NO_LOCATION
  const body = grid ? { date: weather.date, nx: grid.nx, ny: grid.ny } : { date: weather.date, place: weather.place }
  try {
    const { data, error } = await supabase.functions.invoke('unbiseo-weather', { body })
    if (error) return error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 401 ? LOGIN_NEEDED : TRY_LATER
    return sentenceOf(data, weather, today)
  } catch {
    return TRY_LATER
  }
}
