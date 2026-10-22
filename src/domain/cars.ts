// 차량 순수 계산부. 저장은 data/store/commitHelpers.ts의 commitCars. 전부 순수 계산 함수(차량 CRUD + 정산/발행 신원 판정).
import { driverFieldsFromDraft } from './carDriverFields.ts'
import type { JsonValue } from './jsonTypes.ts'
import type { CarLike, FinanceSettings } from './financeTypes.ts'
import type { CarUpsertDraft } from './carDriverFields.ts'

export function hasMainCar(cars: Array<CarLike> | null | undefined) {
  return (cars || []).some((car) => car.type === 'main')
}

/**
 * 같은 id는 한 번만 남긴다(먼저 나온 항목). hydrate가 서버 행 + 미동기화 로컬을
 * 이어 붙일 때 같은 raw.id가 두 번 들어가면 React key 경고가 난다.
 * getSnapshot 안에서는 호출하지 말 것(매번 새 배열 → 렌더 루프).
 */
export function dedupeCarsById<T extends { id?: string | number }>(cars: Array<T> | null | undefined): Array<T> {
  const seen = new Set<string>()
  const next: Array<T> = []
  ;(Array.isArray(cars) ? cars : []).forEach((car) => {
    if (!car || typeof car !== 'object') return
    const rawId = (car as { id?: JsonValue }).id
    const id = rawId == null || rawId === '' ? '' : String(rawId)
    if (id) {
      if (seen.has(id)) return
      seen.add(id)
      next.push(rawId === id ? car : ({ ...car, id }) as T)
    } else {
      next.push(car)
    }
  })
  return next
}

function checkDriverLink(name: string | undefined, phone: string | undefined): { field: 'driverName' | 'driverPhone', message: string } | null {
  if (!String(name || '').trim()) return { field: 'driverName', message: '기사명을 입력해 주세요.' }
  if (String(phone || '').replace(/\D/g, '').length < 10) return { field: 'driverPhone', message: '연락처 형식을 확인해 주세요.' }
  return null
}

/**
 * 저장 전 입력 검사 — 맨 처음 문제 칸과 문구, 문제 없으면 null(차량 창 칸 표시와 upsertCar가 같이 씀).
 * 기사 이름·연락처는 "기사 연동"일 때만 필수(linkRequired) — 운행 일지 전용 등록은 비워도 된다.
 */
export function checkCarDraft(draft: CarUpsertDraft, { linkRequired = false }: { linkRequired?: boolean } = {}): { field: 'driverName' | 'driverPhone' | 'number' | 'driverSalaryAmount', message: string } | null {
  const linkProblem = linkRequired ? checkDriverLink(draft.driverName, draft.driverPhone) : null
  if (linkProblem) return linkProblem
  if (!String(draft.number || '').trim()) return { field: 'number', message: '차량번호를 입력해 주세요.' }
  if (draft.type !== 'sub') return null
  const extra = driverFieldsFromDraft(draft, 'sub')
  if (extra.driverPhone && extra.driverPhone.replace(/\D/g, '').length < 10) return { field: 'driverPhone', message: '연락처 형식을 확인해 주세요.' }
  if (extra.driverPayMode === 'salary' && !(Number(extra.driverSalaryAmount) > 0)) {
    return { field: 'driverSalaryAmount', message: '월급제는 급여 금액을 입력해 주세요.' }
  }
  return null
}

export function upsertCar(cars: Array<CarLike> | null | undefined, draft: CarUpsertDraft, editingId?: string | null) {
  const problem = checkCarDraft(draft)
  if (problem) return { error: problem.message, cars }
  const number = String(draft.number || '').trim()
  const tonnage = String(draft.tonnage || '').trim()
  const type = draft.type === 'sub' ? 'sub' : 'main'
  const extra = driverFieldsFromDraft(draft, type)

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

/**
 * "기사 연동" 저장 전 확인 — 운행 일지(미연동)는 이 함수를 쓰지 않는다.
 * 신규 등록 시 진짜 관문은 CarListPage.jsx save()의 사전 검사 — 여기 함수는
 * 그게 호출하는 순수 검증 로직일 뿐.
 * @returns 에러 메시지, 문제 없으면 null
 */
export function validateDriverLinkFields(name: string, phone: string): string | null {
  return checkDriverLink(name, phone)?.message ?? null
}

export function removeCar(cars: Array<CarLike> | null | undefined, id: string) {
  return (cars || []).filter((car) => car.id !== id)
}

export function getShortCarNum(carNum?: string): string {
  if (!carNum || carNum === 'main') return carNum || ''
  const match = carNum.match(/\d{4}$/)
  return match ? match[0] : carNum
}

export function getCarBusinessInfo(car: CarLike | null | undefined, settings: FinanceSettings = {}) {
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

export function isVehicleRevenueSharedWithOwner(car: CarLike | null | undefined) {
  return car?.shareRevenueWithOwner !== false
}

export function getVehicleSupplierIdentity(car: CarLike | null | undefined, settings: FinanceSettings = {}) {
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
  return { key, biz, carLabel: biz.name ? `${biz.name}, ${car.number}` : car.number, carNumber: car.number }
}
