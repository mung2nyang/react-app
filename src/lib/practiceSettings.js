// Step 4 도메인 폴더 이동: 순수 계산은 domain/practiceSettings.js로 옮겼다. 이 파일은
// localStorage I/O(loadPracticeSettings/savePracticeSettings)와 DOM 부작용(applyTheme)만
// 남기고, 기존 임포트 경로('../lib/practiceSettings.js')를 유지하는 배럴로
// domain/practiceSettings.js를 재수출한다.
import { readJsonKey } from '../store/persist.js'
import { commitSettings } from '../store/app-store.js'
import { normalizeSettings } from '../domain/practiceSettings.js'

export function loadPracticeSettings(ownerKey = 'guest') {
  return normalizeSettings(readJsonKey('settings', ownerKey, {}))
}

export function savePracticeSettings(ownerKey, patch) {
  const next = normalizeSettings({ ...loadPracticeSettings(ownerKey), ...(patch || {}) })
  return commitSettings(ownerKey, next)
}

export function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
}

export * from '../domain/practiceSettings.js'
