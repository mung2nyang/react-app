// 고정 노선 칸 읽기 — 횟수 1~20, 노선은 앱이 보낸 등록 노선 이름일 때만(로드맵 24-F-1).
import type { Json } from './question.ts'

export type Fixed = { date: string, count: number, route: string }

const ROUTES_MAX = 30
const ROUTE_NAME_MAX = 60
const COUNT_MAX = 20

/** 앱이 보낸 노선 이름 — 칸이 없으면 빈 목록, 모양이 틀리면 null(400). */
export function readRouteNames(value: Json | undefined): Array<string> | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > ROUTES_MAX) return null
  const names: Array<string> = []
  for (const name of value) {
    if (typeof name !== 'string' || name.length > ROUTE_NAME_MAX) return null
    names.push(name)
  }
  return names
}

const bare = (name: string) => name.replace(/\s+/g, '')

/** date는 index.ts가 운행과 같은 규칙으로 정리해 넘긴다. */
export function readFixed(row: { [key: string]: Json }, date: string, routeNames: Array<string>): Fixed {
  const said = row.fixedCount
  const count = typeof said === 'number' && Number.isInteger(said) && said >= 1 && said <= COUNT_MAX ? said : 1
  const heard = typeof row.fixedRoute === 'string' ? bare(row.fixedRoute) : ''
  const route = heard ? routeNames.find((name) => bare(name) === heard) ?? '' : ''
  return { date, count, route }
}
