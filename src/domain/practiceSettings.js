// Step 4 도메인 폴더 이동: practiceSettings.js의 순수 계산부. localStorage I/O
// (loadPracticeSettings/savePracticeSettings)와 DOM 부작용(applyTheme)은 lib/practiceSettings.js에
// 남아 이 파일을 재수출한다 — applyTheme은 순수 함수가 아니라(document를 직접 바꿈)
// domain으로 옮기지 않았다.
export const RUN_COUNT_PRESET_MAX = 10
export const FIXED_ROUTE_PRESET_MAX = 10

const defaults = {
  unitPrice: 0,
  theme: 'light',
  inputMode: 'count',
  callDetail: false,
  paymentOn: false,
  timeOn: false,
  platformOn: false,
  distanceOn: false,
  cargoTonnageOn: false,
  fixedOn: true,
  fixedRouteOn: false,
  fixedRoutePresets: [],
  runCountToggle: false,
  runCountPresets: [1, 2, 3, 4, 5],
  subFixedOn: true,
  subFixedRouteOn: false,
  subFixedRoutePresets: [],
  subRunCountToggle: false,
  subRunCountPresets: [1, 2, 3, 4, 5],
}

function asBool(value, fallback) {
  if (typeof value === 'boolean') return value
  return fallback
}

function routeId() {
  return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeRunCountPresets(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/)
  const values = []
  source.forEach((item) => {
    const count = parseInt(item, 10)
    if (count > 0 && !values.includes(count) && values.length < RUN_COUNT_PRESET_MAX) values.push(count)
  })
  if (!values.length) return [1, 2, 3, 4, 5]
  return values
}

export function nextRunCountPreset(current) {
  const list = Array.isArray(current) ? current : []
  let next = (list[list.length - 1] || 0) + 1
  while (list.includes(next)) next += 1
  return next
}

export function normalizeFixedRoutePresets(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
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

export function normalizeSettings(raw = {}) {
  const inputMode = raw.inputMode === 'fare' ? 'fare' : 'count'
  const theme = raw.theme === 'dark' ? 'dark' : 'light'
  const fixedOn = asBool(raw.fixedOn, defaults.fixedOn)
  const callDetail = fixedOn ? asBool(raw.callDetail, defaults.callDetail) : true
  return {
    unitPrice: Math.max(0, parseInt(raw.unitPrice, 10) || 0),
    theme,
    inputMode,
    callDetail,
    paymentOn: asBool(raw.paymentOn, defaults.paymentOn),
    timeOn: asBool(raw.timeOn, defaults.timeOn),
    platformOn: asBool(raw.platformOn, defaults.platformOn),
    distanceOn: asBool(raw.distanceOn, defaults.distanceOn),
    cargoTonnageOn: asBool(raw.cargoTonnageOn, defaults.cargoTonnageOn),
    fixedOn,
    fixedRouteOn: asBool(raw.fixedRouteOn, defaults.fixedRouteOn),
    fixedRoutePresets: normalizeFixedRoutePresets(raw.fixedRoutePresets),
    runCountToggle: asBool(raw.runCountToggle, defaults.runCountToggle),
    runCountPresets: normalizeRunCountPresets(raw.runCountPresets),
    subFixedOn: asBool(raw.subFixedOn, fixedOn),
    subFixedRouteOn: asBool(raw.subFixedRouteOn, defaults.subFixedRouteOn),
    subFixedRoutePresets: normalizeFixedRoutePresets(raw.subFixedRoutePresets),
    subRunCountToggle: asBool(raw.subRunCountToggle, defaults.subRunCountToggle),
    subRunCountPresets: normalizeRunCountPresets(raw.subRunCountPresets),
  }
}

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

export function removeFixedRoutePreset(settings, scope, routeIdToRemove) {
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const presets = (Array.isArray(settings[key]) ? settings[key] : []).filter((route) => route.id !== routeIdToRemove)
  return { ...settings, [key]: presets }
}

export function addRunCountPreset(settings, scope) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current = normalizeRunCountPresets(settings[key])
  if (current.length >= RUN_COUNT_PRESET_MAX) {
    return { error: `횟수 버튼은 최대 ${RUN_COUNT_PRESET_MAX}개까지 추가할 수 있습니다.`, settings }
  }
  return { settings: { ...settings, [key]: [...current, nextRunCountPreset(current)] } }
}

export function removeRunCountPreset(settings, scope, index) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current = [...normalizeRunCountPresets(settings[key])]
  if (current.length <= 1) return settings
  current.splice(index, 1)
  return { ...settings, [key]: normalizeRunCountPresets(current) }
}

export function replaceRunCountPreset(settings, scope, index, value) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const current = [...normalizeRunCountPresets(settings[key])]
  current[index] = value
  return { ...settings, [key]: normalizeRunCountPresets(current) }
}
