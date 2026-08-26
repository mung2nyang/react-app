import { readJsonKey } from '../store/persist.js'
import { commitDrivers } from '../store/app-store.js'

export function loadDrivers(ownerKey = 'guest') {
  const parsed = readJsonKey('drivers', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveDrivers(ownerKey, items) {
  commitDrivers(ownerKey, items)
}

export function generateInviteCode(items = []) {
  const used = new Set((items || []).map((item) => item.inviteCode))
  let code = ''
  do {
    code = String(Math.floor(100000 + Math.random() * 900000))
  } while (used.has(code))
  return code
}

export function countByStatus(items) {
  const list = items || []
  return {
    linked: list.filter((item) => item.status === 'linked').length,
    pending: list.filter((item) => item.status !== 'linked').length,
  }
}

export function driverToLink(driver) {
  if (!driver) return null
  return {
    id: driver.id,
    supabaseId: driver.supabaseId,
    driverName: driver.name || driver.driverName || '',
    phone: driver.phone || '',
    inviteCode: driver.inviteCode || '',
    vehicleNumber: driver.vehicleNumber || '',
    assignmentStart: driver.startDate || driver.assignmentStart || '',
    assignmentEnd: driver.endDate || driver.assignmentEnd || '',
    status: driver.status || 'pending',
  }
}

export function driversToLinks(items) {
  return (items || []).map(driverToLink)
}

export function overlapConflictMessage(link) {
  const name = link?.driverName || '다른 기사'
  const start = link?.assignmentStart || ''
  const end = link?.assignmentEnd || '계속'
  return `같은 차량에 ${name}의 할당 기간(${start}~${end})과 겹칩니다.`
}

export function upsertDriver(items, draft, editingId = null, cars = []) {
  const name = String(draft.name || '').trim()
  const phone = String(draft.phone || '').trim()
  const inviteCode = String(draft.inviteCode || '').replace(/\D/g, '')
  const vehicleNumber = String(draft.vehicleNumber || '').trim()
  const startDate = String(draft.startDate || draft.assignmentStart || '').trim()
  const endDate = String(draft.endDate || draft.assignmentEnd || '').trim()

  if (!name) return { error: '기사 이름을 입력해 주세요.', items }
  if (phone.replace(/\D/g, '').length < 10) return { error: '전화번호를 입력해 주세요.', items }
  if (!/^\d{6}$/.test(inviteCode)) return { error: '초대 코드 6자리를 입력해 주세요.', items }

  if (vehicleNumber) {
    const targetCar = (cars || []).find((car) => car.number === vehicleNumber)
    if (targetCar?.type === 'main') {
      return { error: '메인 차량은 기사에게 할당할 수 없습니다. 기사차량 번호를 입력해 주세요.', items }
    }
    if (!startDate) return { error: '기사 이름, 할당 차량, 시작일을 입력해 주세요.', items }
  }
  if (endDate && startDate && endDate < startDate) {
    return { error: '할당 종료일은 시작일 이후로 선택해 주세요.', items }
  }

  const list = [...(items || [])]
  const duplicate = list.some((item) => item.inviteCode === inviteCode && item.id !== editingId)
  if (duplicate) return { error: '이미 쓰인 초대 코드입니다.', items }

  if (vehicleNumber && startDate) {
    const conflicting = findOverlappingDriverLink(driversToLinks(list), vehicleNumber, startDate, endDate, editingId)
    if (conflicting) return { error: overlapConflictMessage(conflicting), items }
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

export function setDriverStatus(items, id, status) {
  return (items || []).map((item) => (item.id === id ? { ...item, status } : item))
}

export function removeDriver(items, id) {
  return (items || []).filter((item) => item.id !== id)
}

export function isDateWithinAssignment(dateKey, assignmentStart, assignmentEnd) {
  if (!assignmentStart) return true
  if (dateKey < assignmentStart) return false
  if (assignmentEnd && dateKey > assignmentEnd) return false
  return true
}

export function assignmentRangesOverlap(startA, endA, startB, endB) {
  const aEnd = endA || '9999-12-31'
  const bEnd = endB || '9999-12-31'
  return startA <= bEnd && startB <= aEnd
}

export function findOverlappingDriverLink(links, vehicleNumber, start, end, excludeId) {
  if (!vehicleNumber || !start) return null
  return (links || []).find((link) => {
    if (excludeId && link.id === excludeId) return false
    if (link.status === 'disconnected') return false
    if ((link.vehicleNumber || '') !== vehicleNumber) return false
    if (!link.assignmentStart) return false
    return assignmentRangesOverlap(start, end, link.assignmentStart, link.assignmentEnd || '')
  })
}
