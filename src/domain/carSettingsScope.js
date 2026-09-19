// @ts-check
// §16 슬라이스 D: 일지·달력 화면이 차량(logId)별 설정값을 읽게 하는 읽기 전용 스코프.
import { defaultCarSettings } from './practiceSettings.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */

/**
 * 서브차량이면 세부입력 5종+inputMode를 그 차량 저장값으로 덮어쓴 사본을 준다
 * (저장값 없으면 AppSettingsPage와 같은 기본값). 그 외 값(결제·고정노선 등)은 공용 그대로.
 * @param {FinanceSettings} settings
 * @param {string} logId
 * @returns {FinanceSettings}
 */
export function resolveLogSettings(settings, logId) {
  if (!logId || logId === 'main') return settings
  return { ...settings, ...(settings.subCarSettings?.[logId] || defaultCarSettings()) }
}
