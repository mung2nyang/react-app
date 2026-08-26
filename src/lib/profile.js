import { readJsonKey } from '../store/persist.js'
import { commitProfile } from '../store/app-store.js'

const emptyProfile = {
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
  return { ...emptyProfile, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
}

export function saveProfile(ownerKey, profile) {
  const next = { ...emptyProfile, ...(profile || {}) }
  return commitProfile(ownerKey, next)
}
