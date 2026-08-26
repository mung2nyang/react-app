import { scheduleCloudSync } from './cloudSync.js'

const STORAGE_PREFIX = 'reactPracticeProfile'

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
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${ownerKey}`)
    const parsed = raw ? JSON.parse(raw) : {}
    return { ...emptyProfile, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    return { ...emptyProfile }
  }
}

export function saveProfile(ownerKey, profile) {
  const next = { ...emptyProfile, ...(profile || {}) }
  localStorage.setItem(`${STORAGE_PREFIX}:${ownerKey}`, JSON.stringify(next))
  scheduleCloudSync()
  return next
}
