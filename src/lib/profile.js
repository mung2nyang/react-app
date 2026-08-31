// persist 배럴(loadProfile)과 saveProfile→commitProfile. 화면 읽기는
// useOwnerProfile / readOwnerProfile.
import { readJsonKey } from '../store/persist.js'
import { commitProfile } from '../store/commitHelpers.js'

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

export function saveProfile(ownerKey, profile) {
  const next = { ...EMPTY_PROFILE, ...(profile || {}) }
  return commitProfile(ownerKey, next)
}
