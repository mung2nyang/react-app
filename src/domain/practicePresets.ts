// 운행 횟수 버튼·노선 이름표(프리셋) 정규화와 scope별 추가·삭제·교체 — practiceSettings.ts가 다시 내보낸다.
// 서로 얽혀 있는 프리셋 함수끼리 한 파일에 둔다.
import type { JsonValue } from './jsonTypes.ts'
import type { FinanceSettings } from './financeTypes.ts'

export const RUN_COUNT_PRESET_MAX = 10
export const FIXED_ROUTE_PRESET_MAX = 10

function routeId(): string {
  return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeRunCountPresets(value: JsonValue | undefined): Array<number> {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/)
  const values: Array<number> = []
  source.forEach((item) => {
    const count = parseInt(String(item), 10)
    if (count > 0 && !values.includes(count) && values.length < RUN_COUNT_PRESET_MAX) values.push(count)
  })
  if (!values.length) return [1, 2, 3, 4, 5]
  return values
}

export function nextRunCountPreset(current: Array<number> | null | undefined): number {
  const list = Array.isArray(current) ? current : []
  let next = (list[list.length - 1] || 0) + 1
  while (list.includes(next)) next += 1
  return next
}

export function normalizeFixedRoutePresets(value: JsonValue | undefined): Array<{ id: string, loadLoc: string, unloadLoc: string }> {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const presets: Array<{ id: string, loadLoc: string, unloadLoc: string }> = []
  value.forEach((route) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) return
    const loadLoc = String(route?.loadLoc || '').trim()
    const unloadLoc = String(route?.unloadLoc || '').trim()
    const id = String(route?.id || '').trim() || routeId()
    if (!loadLoc || !unloadLoc || seen.has(id) || presets.length >= FIXED_ROUTE_PRESET_MAX) return
    seen.add(id)
    presets.push({ id, loadLoc, unloadLoc })
  })
  return presets
}

/** 노선 추가 전 검사 — 빈 칸을 상차지 → 하차지 순서로 하나 돌려준다. */
export function checkRoutePreset(loadLoc: JsonValue | undefined, unloadLoc: JsonValue | undefined): { field: 'loadLoc' | 'unloadLoc', message: string } | null {
  if (!String(loadLoc || '').trim()) return { field: 'loadLoc', message: '상차지를 입력해 주세요.' }
  if (!String(unloadLoc || '').trim()) return { field: 'unloadLoc', message: '하차지를 입력해 주세요.' }
  return null
}

export function addFixedRoutePreset(settings: FinanceSettings, scope: 'main' | 'sub', loadLoc: JsonValue | undefined, unloadLoc: JsonValue | undefined): { settings: FinanceSettings, error?: string } {
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const load = String(loadLoc || '').trim()
  const unload = String(unloadLoc || '').trim()
  const problem = checkRoutePreset(load, unload)
  if (problem) return { error: problem.message, settings }
  const presets = Array.isArray(settings[key]) ? [...settings[key]] : []
  if (presets.length >= FIXED_ROUTE_PRESET_MAX) {
    return { error: '노선은 최대 10개까지 등록할 수 있습니다.', settings }
  }
  presets.push({ id: routeId(), loadLoc: load, unloadLoc: unload })
  return { settings: { ...settings, [key]: presets } }
}

export function removeFixedRoutePreset(settings: FinanceSettings, scope: 'main' | 'sub', routeIdToRemove: string): FinanceSettings {
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const presets = (Array.isArray(settings[key]) ? settings[key] : []).filter((route) => route.id !== routeIdToRemove)
  return { ...settings, [key]: presets }
}

export function addRunCountPreset(settings: FinanceSettings, scope: 'main' | 'sub'): { settings: FinanceSettings, error?: string } {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current = normalizeRunCountPresets(settings[key])
  if (current.length >= RUN_COUNT_PRESET_MAX) {
    return { error: `횟수 버튼은 최대 ${RUN_COUNT_PRESET_MAX}개까지 추가할 수 있습니다.`, settings }
  }
  return { settings: { ...settings, [key]: [...current, nextRunCountPreset(current)] } }
}

/** 값으로 찾아 지운다 — 앞 저장으로 순서가 바뀌어도 같은 버튼(1개 남으면 그대로). */
export function removeRunCountPreset(settings: FinanceSettings, scope: 'main' | 'sub', count: number): FinanceSettings {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current = [...normalizeRunCountPresets(settings[key])]
  const index = current.indexOf(count)
  if (current.length <= 1 || index < 0) return settings
  current.splice(index, 1)
  return { ...settings, [key]: normalizeRunCountPresets(current) }
}

/** 값으로 찾아 바꾼다 — 없으면 그대로. */
export function replaceRunCountPreset(settings: FinanceSettings, scope: 'main' | 'sub', count: number, value: JsonValue): FinanceSettings {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current: Array<JsonValue> = [...normalizeRunCountPresets(settings[key])]
  const index = current.indexOf(count)
  if (index < 0) return settings
  current[index] = value
  return { ...settings, [key]: normalizeRunCountPresets(current) }
}
