import { scheduleCloudSync } from './cloudSync.js'

const STORAGE_PREFIX = 'reactPracticeCars'

export function loadCars(ownerKey = 'guest') {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${ownerKey}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCars(ownerKey, cars) {
  localStorage.setItem(`${STORAGE_PREFIX}:${ownerKey}`, JSON.stringify(cars))
  scheduleCloudSync()
}

export const SETTLEMENT_MODES = [
  { value: 'company', label: '회사 정산', description: '회사가 거래처에 매출 계산서를 발행하고 기사 계산서를 수취합니다.' },
  { value: 'driver_direct', label: '기사 직접 정산', description: '기사가 거래처에 직접 발행하고 회사는 기사에게 수수료 계산서를 발행합니다.' },
  { value: 'employee', label: '직원 기사', description: '회사가 거래처에 발행하며 기사 계산서는 만들지 않습니다.' },
  { value: 'none', label: '계산서 미사용', description: '이 기사차량 운행분은 계산서 자동 생성에서 제외합니다.' },
]

export function hasMainCar(cars) {
  return (cars || []).some((car) => car.type === 'main')
}

export function getSettlementModeMeta(mode) {
  return SETTLEMENT_MODES.find((item) => item.value === mode) || SETTLEMENT_MODES[0]
}

function driverFieldsFromDraft(draft, type) {
  if (type !== 'sub') {
    return {
      driverName: '',
      driverPhone: '',
      settlementMode: 'default',
      commEnabled: false,
      commType: 'percent',
      commission: '',
    }
  }
  const commType = draft.commType === 'direct' ? 'direct' : 'percent'
  const commEnabled = !!draft.commEnabled
  return {
    driverName: String(draft.driverName || '').trim(),
    driverPhone: String(draft.driverPhone || '').trim(),
    settlementMode: SETTLEMENT_MODES.some((item) => item.value === draft.settlementMode)
      ? draft.settlementMode
      : 'company',
    commEnabled,
    commType,
    commission: commEnabled ? String(draft.commission || '').trim() : '',
  }
}

export function upsertCar(cars, draft, editingId = null) {
  const number = String(draft.number || '').trim()
  const tonnage = String(draft.tonnage || '').trim()
  if (!number) return { error: '차량번호를 입력해 주세요.', cars }

  const type = draft.type === 'sub' ? 'sub' : 'main'
  const extra = driverFieldsFromDraft(draft, type)
  if (type === 'sub') {
    const phoneDigits = extra.driverPhone.replace(/\D/g, '')
    if (!extra.driverName || phoneDigits.length < 10) {
      return { error: '기사명과 연락처를 확인해 주세요.', cars }
    }
  }

  const list = [...(cars || [])]

  if (editingId) {
    const idx = list.findIndex((car) => car.id === editingId)
    if (idx < 0) return { error: '차량을 찾지 못했습니다.', cars }
    const othersHaveMain = list.some((car, i) => i !== idx && car.type === 'main')
    if (type === 'main' && othersHaveMain) {
      return { error: '메인 차량이 이미 등록되어 있습니다.', cars }
    }
    list[idx] = { ...list[idx], number, tonnage, type, ...extra }
    return { cars: list }
  }

  if (type === 'main' && hasMainCar(list)) {
    return { error: '메인 차량이 이미 등록되어 있습니다.', cars }
  }

  list.push({
    id: `car-${Date.now()}`,
    type,
    number,
    tonnage,
    ...extra,
  })
  return { cars: list }
}

export function removeCar(cars, id) {
  return (cars || []).filter((car) => car.id !== id)
}

export function getShortCarNum(carNum) {
  if (!carNum || carNum === 'main') return carNum
  const match = carNum.match(/\d{4}$/)
  return match ? match[0] : carNum
}

export function getEffectiveDriverSettlementMode(car, settings = {}) {
  const selected = car?.settlementMode || 'default'
  return selected === 'default' ? (settings.defaultDriverSettlementMode || 'company') : selected
}

export function getCarBusinessInfo(car, settings = {}) {
  const ownerBiz = {
    name: settings.bizName || '',
    bizNumber: settings.bizNumber || '',
    representative: settings.bizRepresentative || settings.userName || '',
    address: settings.bizAddress || '',
    bizType: settings.bizType || '',
    bizItem: settings.bizItem || '',
    email: settings.bizEmail || '',
  }
  if (!car || car.type !== 'sub') return { sameAsOwner: true, ...ownerBiz }

  const info = car.businessInfo
  if (!info || info.sameAsOwner) return { sameAsOwner: true, ...ownerBiz }

  return {
    sameAsOwner: false,
    name: info.name || '',
    bizNumber: info.bizNumber || '',
    representative: info.representative || '',
    address: info.address || '',
    bizType: info.bizType || '',
    bizItem: info.bizItem || '',
    email: info.email || '',
  }
}

export function isVehicleRevenueSharedWithOwner(car) {
  return car?.shareRevenueWithOwner !== false
}

export function getVehicleSupplierIdentity(car, settings = {}) {
  const ownerBiz = {
    sameAsOwner: true,
    name: settings.bizName || '',
    bizNumber: settings.bizNumber || '',
    representative: settings.bizRepresentative || settings.userName || '',
    address: settings.bizAddress || '',
    bizType: settings.bizType || '',
    bizItem: settings.bizItem || '',
    email: settings.bizEmail || '',
  }
  if (!car || car.type !== 'sub') {
    return { key: `owner:${ownerBiz.bizNumber || ownerBiz.name || 'default'}`, biz: ownerBiz, carLabel: '메인 차량', carNumber: null }
  }
  const biz = getCarBusinessInfo(car, settings)
  if (biz.sameAsOwner) {
    return { key: `owner:${ownerBiz.bizNumber || ownerBiz.name || 'default'}`, biz: ownerBiz, carLabel: car.number, carNumber: car.number }
  }
  const key = `car:${car.number}:${biz.bizNumber || biz.name || 'noinfo'}`
  return { key, biz, carLabel: biz.name ? `${biz.name} · ${car.number}` : car.number, carNumber: car.number }
}
