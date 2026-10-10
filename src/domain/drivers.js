// @ts-check
/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// Step 4 도메인 폴더 이동: drivers.js의 순수 계산부. localStorage I/O(loadDrivers/
// saveDrivers)는 lib/drivers.js에 남아 이 파일을 재수출한다.
//
// 2026-09-01 보리 지시: 날짜/기간 겹침 계산 차단(findOverlappingDriverLink 등)은
// 요구한 적 없는 코드라 제거했다. 남긴 규칙은 "같은 차량번호는 한 기사에게만"
// 하나뿐이다(기간 무관, 연결 해제된 기사는 제외).
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {{ number?: string, type?: string }} CarRef */
/** @typedef {Pick<DriverRecord, 'name'|'phone'|'inviteCode'|'vehicleNumber'|'startDate'|'endDate'> & { assignmentStart?: string, assignmentEnd?: string }} DriverDraft */

// 10-S-2: 헷갈리는 0·O·1·I·L을 뺀 31종 10자리. 서버(0019)도 같은 형식만 받는다.
const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const INVITE_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/

/** @param {JsonValue|undefined} value */
export function normalizeInviteCode(value) {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

/** @param {string|null|undefined} code */
export function formatInviteCode(code) {
  const value = code || ''
  return INVITE_CODE_PATTERN.test(value) ? `${value.slice(0, 5)}-${value.slice(5)}` : value
}

/**
 * @param {Array<{ inviteCode?: string }>|null|undefined} [items]
 */
export function generateInviteCode(items = []) {
  const used = new Set((items || []).map((item) => item.inviteCode))
  let code = ''
  do {
    code = ''
    while (code.length < 10) {
      // 248 이상은 버려 31로 나눈 나머지가 고르게 나오게 한다.
      for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(16))) {
        if (byte < 248 && code.length < 10) code += INVITE_ALPHABET[byte % 31]
      }
    }
  } while (used.has(code))
  return code
}

/**
 * @param {Array<DriverRecord>|null|undefined} items
 */
export function countByStatus(items) {
  const list = items || []
  return {
    linked: list.filter((item) => item.status === 'linked').length,
    pending: list.filter((item) => item.status !== 'linked').length,
  }
}

/**
 * @param {Array<DriverRecord>} items
 * @param {DriverDraft} draft
 * @param {string|null|undefined} [editingId]
 * @param {Array<CarRef>|null|undefined} [cars]
 * @returns {{ items: Array<DriverRecord>, error?: string, id?: string }}
 */
export function upsertDriver(items, draft, editingId = null, cars = []) {
  const name = String(draft.name || '').trim()
  const phone = String(draft.phone || '').trim()
  const inviteCode = normalizeInviteCode(draft.inviteCode)
  const vehicleNumber = String(draft.vehicleNumber || '').trim()
  const startDate = String(draft.startDate || draft.assignmentStart || '').trim()
  const endDate = String(draft.endDate || draft.assignmentEnd || '').trim()

  if (!name) return { error: '기사 이름을 입력해 주세요.', items }
  if (phone.replace(/\D/g, '').length < 10) return { error: '전화번호를 입력해 주세요.', items }
  // 예전 6자리 코드는 바꾸지 않고 다시 저장할 때만 허용(연동된 기사 계약 수정 등).
  const keptCode = Boolean(inviteCode) && Boolean(editingId)
    && (items || []).some((item) => item.id === editingId && item.inviteCode === inviteCode)
  if (!INVITE_CODE_PATTERN.test(inviteCode) && !keptCode) {
    return { error: '[코드 생성]으로 초대 코드를 만들어 주세요.', items }
  }

  if (vehicleNumber) {
    const targetCar = (cars || []).find((car) => car.number === vehicleNumber)
    if (targetCar?.type === 'main') {
      return { error: '메인 차량은 기사에게 배정할 수 없습니다. 기사 차량 번호를 입력해 주세요.', items }
    }
    if (!startDate) return { error: '기사 이름, 배정 차량, 시작일을 입력해 주세요.', items }
  }
  if (endDate && startDate && endDate < startDate) {
    return { error: '계약 종료일은 시작일 이후로 선택해 주세요.', items }
  }

  const list = [...(items || [])]
  const duplicate = list.some((item) => item.inviteCode === inviteCode && item.id !== editingId)
  if (duplicate) return { error: '이미 쓰인 초대 코드입니다.', items }

  // 같은 차량번호는 한 기사에게만(기간 무관). 연결 해제된 기사는 비운 것으로 본다.
  if (vehicleNumber) {
    const taken = list.some((item) => (
      item.id !== editingId
      && String(item.status || '') !== 'disconnected'
      && String(item.vehicleNumber || '').trim() === vehicleNumber
    ))
    if (taken) return { error: '이미 다른 기사에게 배정된 차량입니다.', items }

    // 한 기사는 차량 1대에만 배정(전화번호 숫자 기준). 연결 해제된 기사는 제외.
    const cleanPhone = phone.replace(/\D/g, '')
    const driverBusy = list.some((item) => (
      item.id !== editingId
      && String(item.status || '') !== 'disconnected'
      && Boolean(String(item.vehicleNumber || '').trim())
      && String(item.phone || '').replace(/\D/g, '') === cleanPhone
    ))
    if (driverBusy) return { error: '이미 다른 차량에 배정된 기사입니다.', items }
  }

  const next = { name, phone, inviteCode, vehicleNumber, startDate, endDate }

  if (editingId) {
    const idx = list.findIndex((item) => item.id === editingId)
    if (idx < 0) return { error: '기사를 찾지 못했습니다.', items }
    list[idx] = { ...list[idx], ...next }
    return { items: list }
  }

  list.push({ id: `drv-${Date.now()}`, status: 'pending', ...next })
  return { items: list }
}

/**
 * @param {Array<DriverRecord>} items
 * @param {string} id
 * @param {'pending'|'linked'} status
 * @returns {Array<DriverRecord>}
 */
export function setDriverStatus(items, id, status) {
  return (items || []).map((item) => (item.id === id ? { ...item, status } : item))
}

/**
 * @param {Array<DriverRecord>} items
 * @param {string} id
 * @returns {Array<DriverRecord>}
 */
export function removeDriver(items, id) {
  return (items || []).filter((item) => item.id !== id)
}

/**
 * @param {string} dateKey
 * @param {string|null|undefined} assignmentStart
 * @param {string|null|undefined} assignmentEnd
 */
export function isDateWithinAssignment(dateKey, assignmentStart, assignmentEnd) {
  if (!assignmentStart) return true
  if (dateKey < assignmentStart) return false
  if (assignmentEnd && dateKey > assignmentEnd) return false
  return true
}

/**
 * 할당 기간 기준 UI 상태(바닐라 `getAssignmentState`와 동일).
 * @param {{ assignmentStart?: string, assignmentEnd?: string, startDate?: string, endDate?: string }|null|undefined} link
 * @returns {{ key: 'scheduled'|'ended'|'active', label: string }}
 */
export function getAssignmentState(link) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startRaw = link?.assignmentStart || link?.startDate || ''
  const endRaw = link?.assignmentEnd || link?.endDate || ''
  const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null
  const end = endRaw ? new Date(`${endRaw}T23:59:59`) : null
  if (start && start > today) return { key: 'scheduled', label: '배정 예정' }
  if (end && end < today) return { key: 'ended', label: '배정 종료' }
  return { key: 'active', label: '배정 중' }
}
