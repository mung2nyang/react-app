// @ts-check
// 개인정보 저장(saveProfile→commitProfile). 화면 읽기는 useOwnerProfile / readOwnerProfile.
import { commitProfile } from '../store/commitHelpers.js'
import { readOwnerSettings } from '../store/ownerDataHooks.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.js'
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

/**
 * @param {string} ownerKey
 * @param {import('../hydrate/hydrateMergeTypes.js').LocalProfile} [profile]
 */
export async function saveProfile(ownerKey, profile) {
  const next = { ...EMPTY_PROFILE, ...(profile || {}) }
  if (getCloudOwnerKey() !== ownerKey) return commitProfile(ownerKey, next)
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  await upsertProfileOnSupabase(/** @type {string} */ (userId), next, readOwnerSettings(ownerKey), { ownFieldsOnly: userId !== ownerKey })
  assertSessionStillCurrent(captured)
  return commitProfile(ownerKey, next)
}
