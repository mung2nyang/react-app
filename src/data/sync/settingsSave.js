// @ts-check
// 앱 설정 저장(savePracticeSettings)과 화면 테마 적용(applyTheme) — 계산 규칙은 domain/practiceSettings.js.
import { commitSettings } from '../store/commitHelpers.js'
import { normalizeSettings } from '../../domain/practiceSettings.js'
import { readOwnerProfile, readOwnerSettings } from '../store/ownerDataHooks.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.js'
import { upsertProfileOnSupabase } from './profileCloudCommit.js'

/** @typedef {import('../../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {FinanceSettings | ((current: FinanceSettings) => FinanceSettings)} SettingsPatch 목록·묶음 설정은 최신 설정을 받아 바꿀 값을 돌려주는 함수로 */

// 계정별로 한 번에 하나씩, 앞 저장이 끝난 최신 설정 위에 얹는다 — 연달아 눌러도 앞 변경이 되돌아가지 않게.
/** @type {Map<string, Promise<void>>} */
const saveTails = new Map()

/**
 * @param {string} ownerKey
 * @param {SettingsPatch} [patch]
 * @returns {Promise<FinanceSettings>}
 */
export function savePracticeSettings(ownerKey, patch) {
  const previous = saveTails.get(ownerKey) || Promise.resolve()
  const run = previous.then(() => saveSettingsNow(ownerKey, patch))
  /** @type {Promise<void>} */
  const tail = run.then(() => undefined, () => undefined)
  saveTails.set(ownerKey, tail)
  void tail.then(() => { if (saveTails.get(ownerKey) === tail) saveTails.delete(ownerKey) })
  return run
}

/**
 * @param {string} ownerKey
 * @param {SettingsPatch} [patch]
 */
async function saveSettingsNow(ownerKey, patch) {
  const current = readOwnerSettings(ownerKey)
  const changes = typeof patch === 'function' ? patch(current) : patch
  const next = normalizeSettings({ ...current, ...(changes || {}) })
  if (getCloudOwnerKey() !== ownerKey) return commitSettings(ownerKey, next)
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  await upsertProfileOnSupabase(/** @type {string} */ (userId), readOwnerProfile(ownerKey), next, { ownFieldsOnly: userId !== ownerKey })
  assertSessionStillCurrent(captured)
  return commitSettings(ownerKey, next)
}

/** @param {'light' | 'dark'} [theme] */
export function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  // 10-L: 다음에 앱 파일이 오기 전 로딩 화면 색(index.html)용 — 화면 색만 기억, 못 써도 무시.
  try { localStorage.setItem('lastTheme', theme === 'dark' ? 'dark' : 'light') } catch { /* 무시 */ }
}
