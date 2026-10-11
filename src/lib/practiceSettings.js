// @ts-check
// 앱 설정 localStorage I/O와 화면 테마 적용(applyTheme) + domain/practiceSettings.js 재수출 배럴.
import { readJsonKey } from '../store/persist.js'
import { commitSettings } from '../store/commitHelpers.js'
import { normalizeSettings } from '../domain/practiceSettings.js'
import { readOwnerProfile, readOwnerSettings } from '../store/ownerDataHooks.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from './cloudSession.js'
import { upsertProfileOnSupabase } from './profileCloudCommit.js'

/** @param {string} [ownerKey] */
export function loadPracticeSettings(ownerKey = 'guest') {
  return normalizeSettings(readJsonKey('settings', ownerKey, {}))
}

/**
 * @param {string} ownerKey
 * @param {import('../domain/financeTypes.js').FinanceSettings} [patch]
 */
export async function savePracticeSettings(ownerKey, patch) {
  const next = normalizeSettings({ ...readOwnerSettings(ownerKey), ...(patch || {}) })
  if (getCloudOwnerKey() !== ownerKey) return commitSettings(ownerKey, next)
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  await upsertProfileOnSupabase(/** @type {string} */ (userId), readOwnerProfile(ownerKey), next, { ownFieldsOnly: userId !== ownerKey })
  assertSessionStillCurrent(captured)
  return commitSettings(ownerKey, next, { syncToCloud: false })
}

/** @param {'light' | 'dark'} [theme] */
export function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  // 10-L: 다음에 앱 파일이 오기 전 로딩 화면 색(index.html)용 — 화면 색만 기억, 못 써도 무시.
  try { localStorage.setItem('lastTheme', theme === 'dark' ? 'dark' : 'light') } catch { /* 무시 */ }
}

export * from '../domain/practiceSettings.js'
