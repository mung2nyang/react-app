// persist 배럴(loadProfile)과 saveProfile→commitProfile. 화면 읽기는
// useOwnerProfile / readOwnerProfile.
import { readJsonKey } from '../store/persist.js'
import { commitProfile } from '../store/commitHelpers.js'
import { readOwnerSettings } from '../store/ownerDataHooks.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from './cloudSession.js'
import { upsertProfileOnSupabase } from './profileCloudCommit.js'

export const EMPTY_PROFILE = {
  bizName: '',
  bizRepresentative: '',
  bizNumber: '',
  bizAddress: '',
  bizType: '',
  bizItem: '',
  bizEmail: '',
  name: '',
  phone: '',
  bankName: '',
  accountNumber: '',
  accountHolder: '',
}

export function loadProfile(ownerKey = 'guest') {
  const parsed = readJsonKey('profile', ownerKey, {})
  return { ...EMPTY_PROFILE, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
}

export async function saveProfile(ownerKey, profile) {
  const next = { ...EMPTY_PROFILE, ...(profile || {}) }
  if (getCloudOwnerKey() !== ownerKey) return commitProfile(ownerKey, next)
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  await upsertProfileOnSupabase(/** @type {string} */ (userId), next, readOwnerSettings(ownerKey))
  assertSessionStillCurrent(captured)
  return commitProfile(ownerKey, next, { syncToCloud: false })
}
