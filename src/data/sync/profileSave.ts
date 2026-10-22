// 개인정보 저장(saveProfile→commitProfile). 화면 읽기는 useOwnerProfile / readOwnerProfile.
import { commitProfile } from '../store/commitHelpers.ts'
import { readOwnerSettings } from '../store/ownerDataHooks.ts'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.ts'
import { upsertProfileOnSupabase } from './profileCloudCommit.ts'
import type { LocalProfile } from '../hydrate/hydrateMergeTypes.ts'

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

export async function saveProfile(ownerKey: string, profile?: LocalProfile) {
  const next = { ...EMPTY_PROFILE, ...(profile || {}) }
  if (getCloudOwnerKey() !== ownerKey) return commitProfile(ownerKey, next)
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const captured = captureSession()
  await upsertProfileOnSupabase((userId) as string, next, readOwnerSettings(ownerKey), { ownFieldsOnly: userId !== ownerKey })
  assertSessionStillCurrent(captured)
  return commitProfile(ownerKey, next)
}
