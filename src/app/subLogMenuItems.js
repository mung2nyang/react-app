// @ts-check
// Step 9 슬라이스 B §5-4: 차주 사이드 메뉴 "[번호] 일지" 목록(모든 sub, logEnabled 무관).
import { getShortCarNum } from '../domain/cars.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {{ number: string, label: string }} SubLogMenuItem */

/**
 * @param {Array<CarLike>|null|undefined} cars
 * @param {boolean} isOwnerSession 소속기사(linkedOwnerId)면 false
 * @returns {Array<SubLogMenuItem>}
 */
export function buildSubLogMenuItems(cars, isOwnerSession) {
  if (!isOwnerSession) return []
  return (Array.isArray(cars) ? cars : [])
    .filter((car) => car?.type === 'sub' && String(car.number || '').trim())
    .map((car) => {
      const number = String(car.number || '').trim()
      return { number, label: getShortCarNum(number) }
    })
}
