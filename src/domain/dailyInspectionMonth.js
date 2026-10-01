// @ts-check
// 서류 발급 일상점검표 한 달 표(9-C-1): 8일 단위 구간과 칸 표기. 표기 규칙(로드맵 9번 ④·결정 "가"·9-C 결정 2):
// 오늘 이후 = 빈칸, 휴무 = 미(저장분이 있어도), 점검표 없음 = 미, 있으면 양호 O·불량 X.

/** @typedef {import('./dailyInspectionItems.js').InspectionItems} InspectionItems */
/** @typedef {'O'|'X'|'미'|''} InspectionMark */

export const RANGE_LABELS = ['1~8일', '9~16일', '17~24일', '25~31일']

/**
 * 그 달 구간(0~3)의 날짜(1부터). 마지막 구간은 그 달 끝날까지.
 * @param {number} year @param {number} month 0부터 @param {number} rangeIndex
 * @returns {Array<number>}
 */
export function rangeDays(year, month, rangeIndex) {
  const last = new Date(year, month + 1, 0).getDate()
  const start = rangeIndex * 8 + 1
  const end = rangeIndex === 3 ? last : Math.min(start + 7, last)
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)
}

/**
 * 처음 보여 줄 구간: 이번 달이면 오늘이 든 구간, 다른 달이면 첫 구간.
 * @param {number} year @param {number} month @param {Date} today
 */
export function initialRangeIndex(year, month, today) {
  if (today.getFullYear() !== year || today.getMonth() !== month) return 0
  return Math.min(3, Math.floor((today.getDate() - 1) / 8))
}

/** @param {number} year @param {number} month @param {number} day */
export function dateKeyOf(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * @param {{ dateKey: string, todayKey: string, isOff: boolean, items: InspectionItems|null|undefined, itemKey: string }} input
 * @returns {InspectionMark}
 */
export function inspectionMark({ dateKey, todayKey, isOff, items, itemKey }) {
  if (dateKey > todayKey) return ''
  if (isOff || !items) return '미'
  const value = items[itemKey]
  if (value === 'good') return 'O'
  if (value === 'bad') return 'X'
  return '미'
}
