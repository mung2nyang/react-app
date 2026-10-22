// 앱 설정 저장(savePracticeSettings)과 화면 테마 적용(applyTheme) — 계산 규칙은 domain/practiceSettings.ts.
import { commitSettings } from '../store/commitHelpers.ts'
import { normalizeSettings } from '../../domain/practiceSettings.ts'
import { readOwnerProfile, readOwnerSettings } from '../store/ownerDataHooks.ts'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.ts'
import { upsertProfileOnSupabase } from './profileCloudCommit.ts'
import type { FinanceSettings } from '../../domain/financeTypes.ts'

/** 목록·묶음 설정은 최신 설정을 받아 바꿀 값을 돌려주는 함수로 */
export type SettingsPatch = FinanceSettings | ((current: FinanceSettings) => FinanceSettings)

// 계정별로 한 번에 하나씩, 앞 저장이 끝난 최신 설정 위에 얹는다 — 연달아 눌러도 앞 변경이 되돌아가지 않게.
const saveTails: Map<string, Promise<void>> = new Map()

export function savePracticeSettings(ownerKey: string, patch?: SettingsPatch): Promise<FinanceSettings> {
  const previous = saveTails.get(ownerKey) || Promise.resolve()
  const run = previous.then(() => saveSettingsNow(ownerKey, patch))
  const tail: Promise<void> = run.then(() => undefined, () => undefined)
  saveTails.set(ownerKey, tail)
  void tail.then(() => { if (saveTails.get(ownerKey) === tail) saveTails.delete(ownerKey) })
  return run
}

async function saveSettingsNow(ownerKey: string, patch?: SettingsPatch) {
  const current = readOwnerSettings(ownerKey)
  const changes = typeof patch === 'function' ? patch(current) : patch
  const next = normalizeSettings({ ...current, ...(changes || {}) })
  if (getCloudOwnerKey() !== ownerKey) return commitSettings(ownerKey, next)
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  await upsertProfileOnSupabase((userId) as string, readOwnerProfile(ownerKey), next, { ownFieldsOnly: userId !== ownerKey })
  assertSessionStillCurrent(captured)
  return commitSettings(ownerKey, next)
}

export function applyTheme(theme?: 'light' | 'dark') {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  // 10-L: 다음에 앱 파일이 오기 전 로딩 화면 색(index.html)용 — 화면 색만 기억, 못 써도 무시.
  try { localStorage.setItem('lastTheme', theme === 'dark' ? 'dark' : 'light') } catch { /* 무시 */ }
}
