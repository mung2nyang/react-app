// @ts-check
// 상차지/하차지 즐겨찾기 칩 — 원본 script.js getFrequentAndRecentLocations /
// renderLocationShortcuts / togglePinnedLocation 순수 로직.
import { getCallDetails } from './day-record.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {{ loadLoc?: string, unloadLoc?: string }} LocationFields */

export const PINNED_LOCATION_LIMIT = 10
export const LOCATION_SHORTCUT_DISPLAY_LIMIT = 12

/**
 * @param {unknown} value
 * @returns {Array<string>}
 */
export function normalizePinnedLocations(value) {
  if (!Array.isArray(value)) return []
  /** @type {Array<string>} */
  const result = []
  for (const item of value) {
    const trimmed = String(item || '').trim()
    if (trimmed && !result.includes(trimmed) && result.length < PINNED_LOCATION_LIMIT) {
      result.push(trimmed)
    }
  }
  return result
}

/**
 * @param {FinanceSettings} settings
 * @param {string} location
 * @returns {{ settings: FinanceSettings, error?: string }}
 */
export function togglePinnedLocation(settings, location) {
  const trimmed = String(location || '').trim()
  if (!trimmed) return { settings }
  const pinned = [...normalizePinnedLocations(settings.pinnedLocations)]
  const index = pinned.indexOf(trimmed)
  if (index >= 0) {
    pinned.splice(index, 1)
  } else {
    if (pinned.length >= PINNED_LOCATION_LIMIT) {
      return {
        error: `고정 장소는 최대 ${PINNED_LOCATION_LIMIT}개까지 등록할 수 있습니다.`,
        settings,
      }
    }
    pinned.push(trimmed)
  }
  return { settings: { ...settings, pinnedLocations: pinned } }
}

/**
 * @param {Record<string, DayRecordLike|undefined>|null|undefined} workData
 * @param {Array<LocationFields>|null|undefined} currentCallDetails
 * @param {Array<string>|null|undefined} pinnedLocations
 * @returns {Array<string>}
 */
export function locationShortcutList(workData, currentCallDetails, pinnedLocations) {
  /** @type {Map<string, { count: number, lastIndex: number }>} */
  const stats = new Map()
  let cursor = 0
  /** @param {unknown} value */
  function addLocation(value) {
    const location = String(value || '').trim()
    if (!location) return
    const entry = stats.get(location) || { count: 0, lastIndex: Infinity }
    entry.count += 1
    entry.lastIndex = Math.min(entry.lastIndex, cursor)
    stats.set(location, entry)
    cursor += 1
  }
  /** @param {LocationFields} item */
  function addFromDetail(item) {
    addLocation(item.loadLoc)
    addLocation(item.unloadLoc)
  }

  ;[...(currentCallDetails || [])].reverse().forEach(addFromDetail)
  Object.keys(workData || {}).sort().reverse().forEach((dateKey) => {
    ;[...getCallDetails((workData || {})[dateKey])].reverse().forEach(addFromDetail)
  })

  const ranked = [...stats.entries()]
    .sort((a, b) => (b[1].count - a[1].count) || (a[1].lastIndex - b[1].lastIndex))
    .map(([location]) => location)

  const pinned = normalizePinnedLocations(pinnedLocations)
  return [...pinned, ...ranked.filter((loc) => !pinned.includes(loc))]
    .slice(0, LOCATION_SHORTCUT_DISPLAY_LIMIT)
}
