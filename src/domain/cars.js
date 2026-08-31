// @ts-check
// Step 4 도메인 폴더 이동: cars.js의 순수 계산부. localStorage I/O(loadCars/saveCars)는
// lib/cars.js에 남아 이 파일을 재수출한다.

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */

/**
 * @typedef {Object} CarUpsertDraft
 * @property {string} [number]
 * @property {string} [tonnage]
 * @property {'main'|'sub'} [type]
 * @property {string} [driverName]
 * @property {string} [driverPhone]
 * @property {string} [settlementMode]
 * @property {boolean} [commEnabled]
 * @property {string} [commType]
 * @property {string} [commission]
 */
export const SETTLEMENT_MODES = [
  { value: 'company', label: '회사 정산', description: '회사가 거래처에 매출 계산서를 발행하고 기사 계산서를 수취합니다.' },
  { value: 'driver_direct', label: '기사 직접 정산', description: '기사가 거래처에 직접 발행하고 회사는 기사에게 수수료 계산서를 발행합니다.' },
  { value: 'employee', label: '직원 기사', description: '회사가 거래처에 발행하며 기사 계산서는 만들지 않습니다.' },
  { value: 'none', label: '계산서 미사용', description: '이 기사차량 운행분은 계산서 자동 생성에서 제외합니다.' },
]

/** @param {Array<CarLike>|null|undefined} cars */
export function hasMainCar(cars) {
  return (cars || []).some((car) => car.type === 'main')
}

/**
 * 같은 id는 한 번만 남긴다(먼저 나온 항목). hydrate가 서버 행 + 미동기화 로컬을
 * 이어 붙일 때 같은 raw.id가 두 번 들어가면 React key 경고가 난다.
 * getSnapshot 안에서는 호출하지 말 것(매번 새 배열 → 렌더 루프).
 * @template {{ id?: string|number }} T
 * @param {Array<T>|null|undefined} cars
 * @returns {Array<T>}
 */
export function dedupeCarsById(cars) {
  const seen = new Set()
  /** @type {Array<T>} */
  const next = []
  ;(Array.isArray(cars) ? cars : []).forEach((car) => {
    if (!car || typeof car !== 'object') return
    const rawId = /** @type {{ id?: unknown }} */ (car).id
    const id = rawId == null || rawId === '' ? '' : String(rawId)
    if (id) {
      if (seen.has(id)) return
      seen.add(id)
      next.push(rawId === id ? car : /** @type {T} */ ({ ...car, id }))
    } else {
      next.push(car)
    }
  })
  return next
}

/** @param {string} [mode] */
export function getSettlementModeMeta(mode) {
  return SETTLEMENT_MODES.find((item) => item.value === mode) || SETTLEMENT_MODES[0]
}

/**
 * @param {CarUpsertDraft} draft
 * @param {'main'|'sub'} type
 */
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

/**
 * @param {Array<CarLike>|null|undefined} cars
 * @param {CarUpsertDraft} draft
 * @param {string|null} [editingId]
 */
export function upsertCar(cars, draft, editingId) {
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
  const duplicate = list.some((car) => car.number === number && (!editingId || car.id !== editingId))
  if (duplicate) return { error: '이미 등록된 차량번호입니다.', cars }

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
    id: `car_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    number,
    tonnage,
    ...extra,
  })
  return { cars: list }
}

/** @param {Array<CarLike>|null|undefined} cars @param {string} id */
export function removeCar(cars, id) {
  return (cars || []).filter((car) => car.id !== id)
}

/** @param {string} [carNum] @returns {string} */
export function getShortCarNum(carNum) {
  if (!carNum || carNum === 'main') return carNum || ''
  const match = carNum.match(/\d{4}$/)
  return match ? match[0] : carNum
}

/** @param {CarLike|null|undefined} car @param {FinanceSettings} [settings] */
export function getEffectiveDriverSettlementMode(car, settings = {}) {
  const selected = car?.settlementMode || 'default'
  return selected === 'default' ? (settings.defaultDriverSettlementMode || 'company') : selected
}

/** @param {CarLike|null|undefined} car @param {FinanceSettings} [settings] */
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

/** @param {CarLike|null|undefined} car */
export function isVehicleRevenueSharedWithOwner(car) {
  return car?.shareRevenueWithOwner !== false
}

/** @param {CarLike|null|undefined} car @param {FinanceSettings} [settings] */
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
