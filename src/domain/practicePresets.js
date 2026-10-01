// @ts-check
// 운행 횟수 버튼·노선 이름표(프리셋) 정규화와 scope별 추가·삭제·교체 — practiceSettings.js에서 통째로 옮김(9-B-1, §6 250줄).
// 서로 얽혀 있는 프리셋 함수끼리 한 파일에 둔다. practiceSettings.js가 그대로 다시 내보내므로 기존 import 경로는 안 바뀐다.

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */

export const RUN_COUNT_PRESET_MAX = 10
export const FIXED_ROUTE_PRESET_MAX = 10

/**
 * @returns {string}
 */
function routeId() {
  return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * @param {unknown} value
 * @returns {Array<number>}
 */
export function normalizeRunCountPresets(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/)
  /** @type {Array<number>} */
  const values = []
  source.forEach((item) => {
    const count = parseInt(String(item), 10)
    if (count > 0 && !values.includes(count) && values.length < RUN_COUNT_PRESET_MAX) values.push(count)
  })
  if (!values.length) return [1, 2, 3, 4, 5]
  return values
}

/**
 * @param {Array<number>|null|undefined} current
 * @returns {number}
 */
export function nextRunCountPreset(current) {
  const list = Array.isArray(current) ? current : []
  let next = (list[list.length - 1] || 0) + 1
  while (list.includes(next)) next += 1
  return next
}

/**
 * @param {unknown} value
 * @returns {Array<{ id: string, loadLoc: string, unloadLoc: string }>}
 */
export function normalizeFixedRoutePresets(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  /** @type {Array<{ id: string, loadLoc: string, unloadLoc: string }>} */
  const presets = []
  value.forEach((route) => {
    const loadLoc = String(route?.loadLoc || '').trim()
    const unloadLoc = String(route?.unloadLoc || '').trim()
    const id = String(route?.id || '').trim() || routeId()
    if (!loadLoc || !unloadLoc || seen.has(id) || presets.length >= FIXED_ROUTE_PRESET_MAX) return
    seen.add(id)
    presets.push({ id, loadLoc, unloadLoc })
  })
  return presets
}

/**
 * @param {FinanceSettings} settings
 * @param {'main'|'sub'} scope
 * @param {unknown} loadLoc
 * @param {unknown} unloadLoc
 * @returns {{ settings: FinanceSettings, error?: string }}
 */
export function addFixedRoutePreset(settings, scope, loadLoc, unloadLoc) {
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const load = String(loadLoc || '').trim()
  const unload = String(unloadLoc || '').trim()
  if (!load || !unload) return { error: '상차지와 하차지를 모두 입력해 주세요.', settings }
  const presets = Array.isArray(settings[key]) ? [...settings[key]] : []
  if (presets.length >= FIXED_ROUTE_PRESET_MAX) {
    return { error: '노선은 최대 10개까지 등록할 수 있습니다.', settings }
  }
  presets.push({ id: routeId(), loadLoc: load, unloadLoc: unload })
  return { settings: { ...settings, [key]: presets } }
}

/**
 * @param {FinanceSettings} settings
 * @param {'main'|'sub'} scope
 * @param {string} routeIdToRemove
 * @returns {FinanceSettings}
 */
export function removeFixedRoutePreset(settings, scope, routeIdToRemove) {
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const presets = (Array.isArray(settings[key]) ? settings[key] : []).filter((route) => route.id !== routeIdToRemove)
  return { ...settings, [key]: presets }
}

/**
 * @param {FinanceSettings} settings
 * @param {'main'|'sub'} scope
 * @returns {{ settings: FinanceSettings, error?: string }}
 */
export function addRunCountPreset(settings, scope) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current = normalizeRunCountPresets(settings[key])
  if (current.length >= RUN_COUNT_PRESET_MAX) {
    return { error: `횟수 버튼은 최대 ${RUN_COUNT_PRESET_MAX}개까지 추가할 수 있습니다.`, settings }
  }
  return { settings: { ...settings, [key]: [...current, nextRunCountPreset(current)] } }
}

/**
 * @param {FinanceSettings} settings
 * @param {'main'|'sub'} scope
 * @param {number} index
 * @returns {FinanceSettings}
 */
export function removeRunCountPreset(settings, scope, index) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current = [...normalizeRunCountPresets(settings[key])]
  if (current.length <= 1) return settings
  current.splice(index, 1)
  return { ...settings, [key]: normalizeRunCountPresets(current) }
}

/**
 * @param {FinanceSettings} settings
 * @param {'main'|'sub'} scope
 * @param {number} index
 * @param {unknown} value
 * @returns {FinanceSettings}
 */
export function replaceRunCountPreset(settings, scope, index, value) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  /** @type {Array<unknown>} */
  const current = [...normalizeRunCountPresets(settings[key])]
  current[index] = value
  return { ...settings, [key]: normalizeRunCountPresets(current) }
}
