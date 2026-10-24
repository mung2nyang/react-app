// 날씨 칸 읽기 — 날짜와 들은 지역 이름(없으면 앱이 현재 위치로).
import type { Json } from './question.ts'

export type WeatherDraft = { date: string, place: string }

const PLACE_MAX = 30

function isDateKey(value: Json | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/** 날짜는 앞날·지난 날도 그대로(범위는 unbiseo-weather가 본다), 틀리거나 없으면 오늘. */
export function readWeatherDraft(row: { [key: string]: Json }, today: string): WeatherDraft {
  const place = typeof row.weatherPlace === 'string' ? row.weatherPlace.trim().slice(0, PLACE_MAX) : ''
  return { date: isDateKey(row.weatherDate) ? row.weatherDate : today, place }
}
