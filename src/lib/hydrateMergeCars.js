// @ts-check
import { dedupeCarsById } from '../domain/cars.js'
import { CAR_SETTLEMENT_MODES, COMM_TYPES, INFO_TYPES, isAllowedEnum } from '../store/persistDomainEnums.js'
import {
  BUSINESS_INFO_KEYS, PERSONAL_INFO_KEYS, isPlainObject, isStringOrFiniteNumber, isStringRecord,
} from '../store/persistDomainRecords.js'

/** @typedef {import('./hydrateMergeTypes.js').LocalCar} LocalCar */
/** @typedef {import('./hydrateMergeTypes.js').RawCarBackup} RawCarBackup */
/** @typedef {import('./hydrateMergeTypes.js').VehicleRow} VehicleRow */

// Step 7 후속(재감사) — `...raw` 스프레드는 Supabase vehicles.raw(JSONB 백업)의
// 필드를 전부 그대로 들여왔다. raw는 sync 시점의 로컬 car 객체 전체를 그대로 저장한
// 것(lib/cloudStorage.js buildVehicleRow의 `raw: car`)이라, persist 스키마
// (store/persistDomainRecords.js의 CAR_KEYS + 각 필드 타입)와 다른 값이 하나만 섞여도
// `isPersistedCar`가 그 차량을 거부하고, cars 배열은 전부 아니면 전무(hasOnlyKeys +
// every)라서 hydrate 직후엔 멀쩡히 저장됐다가 다음 새로고침(initialize) 때 cars
// 도메인 전체가 통째로 사라지는 사고로 이어진다. 아래는 CAR_KEYS에 있는 필드만
// 정본 타입으로 정규화해서 만든다 — 검증기(persistDomainRecords.js)는 건드리지 않고
// 그대로 둔 채(느슨하게 만들지 않는다), producer만 스키마에 맞춘다.

/** @param {string|undefined} value */
function stringOrEmpty(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {boolean|undefined} value */
function boolOrFalse(value) {
  return typeof value === 'boolean' ? value : false
}

// 재감사(불리언 기본값) — insuranceOn/logEnabled/driverLinkEnabled/
// shareRevenueWithOwner/archived는 여기서 false를 심으면 안 된다. 바닐라 정본상
// "값이 아예 없음"과 "명시적으로 false"는 의미가 다르다 — 특히
// shareRevenueWithOwner는 "없음 = 공유(true)"다(car-management.js의
// `document.getElementById('newCarShareRevenueToggle')?.checked ?? true`,
// domain/cars.js의 `isVehicleRevenueSharedWithOwner`도 `!== false`로 읽는다 —
// 기본은 true). raw에 실제 boolean이 없으면 이 필드들은 키 자체를 생략해서
// "정본 소비 쪽 기본값"이 그대로 적용되게 한다 — producer가 임의로 false를
// 채워 넣지 않는다.
/** @param {boolean|undefined} value */
function boolOrOmit(value) {
  return typeof value === 'boolean' ? value : undefined
}

/** @param {string|number|undefined} value */
function numericOrEmpty(value) {
  return value !== undefined && isStringOrFiniteNumber(value) ? value : ''
}

/** @param {string|undefined} value @param {ReadonlyArray<string>} allowed @param {string} fallback */
function enumOrDefault(value, allowed, fallback) {
  return typeof value === 'string' && isAllowedEnum(value, allowed) ? value : fallback
}

/** @param {Array<LocalCar>} localCars @param {Array<VehicleRow>|null|undefined} vehicleRows */
export function mergeCarsFromRows(localCars, vehicleRows) {
  if (!Array.isArray(vehicleRows) || !vehicleRows.length) {
    const next = dedupeCarsById(localCars)
    return next.length === (Array.isArray(localCars) ? localCars.length : 0)
      ? (localCars || next)
      : next
  }
  const cars = vehicleRows.map((row) => {
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : /** @type {RawCarBackup} */ ({})
    const rawId = raw.id == null || raw.id === '' ? '' : String(raw.id)
    /** @type {LocalCar} */
    const car = {
      id: rawId || `car-${row.id}`,
      number: row.number || '',
      type: row.type === 'sub' ? 'sub' : 'main',
      tonnage: row.tonnage || '',
      supabaseId: row.id,
      driverName: stringOrEmpty(row.driver_name ?? raw.driverName),
      driverPhone: stringOrEmpty(raw.driverPhone),
      driverLinkId: stringOrEmpty(raw.driverLinkId),
      settlementMode: enumOrDefault(row.settlement_mode ?? raw.settlementMode, CAR_SETTLEMENT_MODES, 'default'),
      commEnabled: boolOrFalse(row.comm_enabled ?? raw.commEnabled),
      commType: enumOrDefault(row.comm_type ?? raw.commType, COMM_TYPES, 'percent'),
      commission: numericOrEmpty(row.comm_value ?? raw.commission),
      infoType: enumOrDefault(raw.infoType, INFO_TYPES, 'existing'),
    }
    // 아래 5개는 boolOrOmit이다(위 주석 참고) — raw에 진짜 boolean이 있을 때만 키를
    // 채운다. undefined/null이면 키 자체를 생략해서 각 필드의 소비 쪽 기본값
    // (shareRevenueWithOwner는 true, 나머지는 CarLike 소비부의 기존 관례)이 그대로
    // 적용되게 한다.
    const insuranceOn = boolOrOmit(raw.insuranceOn)
    if (insuranceOn !== undefined) car.insuranceOn = insuranceOn
    const logEnabled = boolOrOmit(raw.logEnabled)
    if (logEnabled !== undefined) car.logEnabled = logEnabled
    const driverLinkEnabled = boolOrOmit(raw.driverLinkEnabled)
    if (driverLinkEnabled !== undefined) car.driverLinkEnabled = driverLinkEnabled
    const shareRevenueWithOwner = boolOrOmit(raw.shareRevenueWithOwner)
    if (shareRevenueWithOwner !== undefined) car.shareRevenueWithOwner = shareRevenueWithOwner
    const archived = boolOrOmit(raw.archived)
    if (archived !== undefined) car.archived = archived
    // personalInfo/businessInfo는 중첩 객체라 필드 하나만 default를 줄 수 없다 —
    // 통째로 정본 키셋+타입(isStringRecord, 검증기와 동일 함수)을 만족할 때만 그대로
    // 옮기고, 하나라도 안 맞으면 그 차량의 나머지 필드는 정상 정규화한 채 이 중첩
    // 필드만 생략한다(사용자 승인 방식 — hydrate 전체를 막지 않는다).
    if (isPlainObject(raw.personalInfo ?? null) && isStringRecord(raw.personalInfo ?? null, PERSONAL_INFO_KEYS)) {
      car.personalInfo = raw.personalInfo
    }
    if (isPlainObject(raw.businessInfo ?? null) && isStringRecord(raw.businessInfo ?? null, BUSINESS_INFO_KEYS)) {
      car.businessInfo = raw.businessInfo
    }
    return car
  })
  const unsynced = (localCars || []).filter((car) => car && !car.supabaseId)
  return dedupeCarsById([...cars, ...unsynced])
}
