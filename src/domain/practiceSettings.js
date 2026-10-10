// @ts-check
// Step 4 도메인 폴더 이동: practiceSettings.js의 순수 계산부. localStorage I/O
// (loadPracticeSettings/savePracticeSettings)와 DOM 부작용(applyTheme)은 lib/practiceSettings.js에
// 남아 이 파일을 재수출한다 — applyTheme은 순수 함수가 아니라(document를 직접 바꿈)
// domain으로 옮기지 않았다.
// 프리셋(운행 횟수 버튼·노선 이름표) 함수는 practicePresets.js(9-B-1) — 여기서 그대로 다시 내보낸다.
import { normalizePinnedLocations } from './locationShortcuts.js'
import { normalizeFixedRoutePresets, normalizeRunCountPresets } from './practicePresets.js'

export * from './practicePresets.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */

/** 알림 화면에서 끌 수 있는 종류(lib/notifications.js kind와 같은 이름). */
export const NOTIF_KINDS = ['overdue', 'today', 'driverInvite', 'backup']

/** 끈 알림 종류 — 아는 이름만, 겹침 없이. @param {unknown} raw @returns {Array<string>} */
function normalizeNotifOff(raw) {
  if (!Array.isArray(raw)) return []
  return NOTIF_KINDS.filter((kind) => raw.includes(kind))
}

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
  dailyInspectionOn: false,
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
  pinnedLocations: [],
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function asBool(value, fallback) {
  if (typeof value === 'boolean') return value
  return fallback
}


/**
 * @param {FinanceSettings} [raw]
 * @returns {FinanceSettings}
 */
export function normalizeSettings(raw = {}) {
  const inputMode = raw.inputMode === 'fare' ? 'fare' : 'count'
  const theme = raw.theme === 'dark' ? 'dark' : 'light'
  const fixedOn = asBool(raw.fixedOn, defaults.fixedOn)
  const callDetail = fixedOn ? asBool(raw.callDetail, defaults.callDetail) : true
  return {
    unitPrice: Math.max(0, parseInt(String(raw.unitPrice ?? ''), 10) || 0),
    theme,
    inputMode,
    callDetail,
    paymentOn: asBool(raw.paymentOn, defaults.paymentOn),
    timeOn: asBool(raw.timeOn, defaults.timeOn),
    platformOn: asBool(raw.platformOn, defaults.platformOn),
    distanceOn: asBool(raw.distanceOn, defaults.distanceOn),
    cargoTonnageOn: asBool(raw.cargoTonnageOn, defaults.cargoTonnageOn),
    dailyInspectionOn: asBool(raw.dailyInspectionOn, defaults.dailyInspectionOn),
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
    pinnedLocations: normalizePinnedLocations(raw.pinnedLocations),
    subCarSettings: normalizeSubCarSettingsMap(raw.subCarSettings, asBool(raw.subFixedOn, fixedOn)),
    notifOff: normalizeNotifOff(raw.notifOff),
  }
}

/**
 * 서브차량 전용 설정(§16 슬라이스 C, 세부입력 5종+달력 표시방식만). `subFixedOn`
 * 꺼지면 메인과 동일 규칙으로 `callDetail` 강제 켬(고정노선은 여전히 공용).
 * @param {Partial<import('./financeTypes.js').SubCarPracticeSettings>} [raw]
 * @param {boolean} [subFixedOn]
 * @returns {import('./financeTypes.js').SubCarPracticeSettings}
 */
export function normalizeCarSettings(raw = {}, subFixedOn = true) {
  return {
    inputMode: raw.inputMode === 'fare' ? 'fare' : 'count',
    callDetail: subFixedOn ? asBool(raw.callDetail, defaults.callDetail) : true,
    timeOn: asBool(raw.timeOn, defaults.timeOn),
    platformOn: asBool(raw.platformOn, defaults.platformOn),
    distanceOn: asBool(raw.distanceOn, defaults.distanceOn),
    cargoTonnageOn: asBool(raw.cargoTonnageOn, defaults.cargoTonnageOn),
    dailyInspectionOn: asBool(raw.dailyInspectionOn, defaults.dailyInspectionOn),
  }
}

/** @returns {import('./financeTypes.js').SubCarPracticeSettings} */
export function defaultCarSettings() {
  return normalizeCarSettings()
}

/**
 * @param {unknown} raw
 * @param {boolean} subFixedOn
 * @returns {Record<string, import('./financeTypes.js').SubCarPracticeSettings>}
 */
function normalizeSubCarSettingsMap(raw, subFixedOn) {
  /** @type {Record<string, import('./financeTypes.js').SubCarPracticeSettings>} */
  const map = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map
  Object.entries(raw).forEach(([carNumber, value]) => {
    const key = String(carNumber || '').trim()
    if (!key || !value || typeof value !== 'object' || Array.isArray(value)) return
    map[key] = normalizeCarSettings(/** @type {Partial<import('./financeTypes.js').SubCarPracticeSettings>} */ (value), subFixedOn)
  })
  return map
}

