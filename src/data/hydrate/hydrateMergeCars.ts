import { dedupeCarsById } from '../../domain/cars.ts'
import { COMM_TYPES, DRIVER_PAY_MODES, INFO_TYPES, isAllowedEnum } from '../store/persistDomainEnums.ts'
import {
  BUSINESS_INFO_KEYS, PERSONAL_INFO_KEYS, isPlainObject, isStringOrFiniteNumber, isStringRecord,
} from '../store/persistDomainRecords.ts'
import type { LocalCar, RawCarBackup, VehicleRow } from './hydrateMergeTypes.ts'

// CAR_KEYS에 있는 필드만 정본 타입으로 정규화한다 — raw(JSONB)를 통째로 펼치면 스키마와 다른 값 하나로
// 다음 새로고침 때 cars 전체가 사라진다. 검증기는 느슨하게 하지 않고 producer만 맞춘다.

function stringOrEmpty(value: string | undefined) {
  return typeof value === 'string' ? value : ''
}

function boolOrFalse(value: boolean | undefined) {
  return typeof value === 'boolean' ? value : false
}

// insuranceOn/logEnabled/driverLinkEnabled/shareRevenueWithOwner/archived는 false를 심지 않는다 — "없음"과 "false"는 뜻이 다르다
// (shareRevenueWithOwner는 없음 = 공유). raw에 boolean이 없으면 키를 생략해 소비 쪽 기본값이 적용되게 한다.
function boolOrOmit(value: boolean | undefined) {
  return typeof value === 'boolean' ? value : undefined
}

function numericOrEmpty(value: string | number | undefined) {
  return value !== undefined && isStringOrFiniteNumber(value) ? value : ''
}

function enumOrDefault(value: string | undefined, allowed: ReadonlyArray<string>, fallback: string) {
  return typeof value === 'string' && isAllowedEnum(value, allowed) ? value : fallback
}

export function mergeCarsFromRows(localCars: Array<LocalCar>, vehicleRows: Array<VehicleRow> | null | undefined) {
  // vehicleRows가 배열이면(빈 배열 포함) 서버가 정본 — 로컬로 되돌리면 방금 삭제한 차량이 hydrate 뒤 부활한다. fallback은 조회 실패일 때만.
  if (!Array.isArray(vehicleRows)) {
    return Array.isArray(localCars) ? localCars : []
  }
  const cars = vehicleRows.map((row) => {
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : ({}) as RawCarBackup
    const rawId = raw.id == null || raw.id === '' ? '' : String(raw.id)
    const car: LocalCar = {
      id: rawId || `car-${row.id}`,
      number: row.number || '',
      type: row.type === 'sub' ? 'sub' : 'main',
      tonnage: row.tonnage || '',
      supabaseId: row.id,
      driverName: stringOrEmpty(row.driver_name ?? raw.driverName),
      driverPhone: stringOrEmpty(raw.driverPhone),
      driverLinkId: stringOrEmpty(raw.driverLinkId),
      driverPayMode: enumOrDefault(row.driver_pay_mode ?? raw.driverPayMode, DRIVER_PAY_MODES, 'revenue'),
      driverSalaryAmount: numericOrEmpty(row.driver_salary_amount ?? raw.driverSalaryAmount),
      commEnabled: boolOrFalse(row.comm_enabled ?? raw.commEnabled),
      commType: enumOrDefault(row.comm_type ?? raw.commType, COMM_TYPES, 'percent'),
      commission: numericOrEmpty(row.comm_value ?? raw.commission),
      infoType: enumOrDefault(raw.infoType, INFO_TYPES, 'existing'),
    }
    // 아래 boolean들은 raw에 진짜 boolean이 있을 때만 키를 채운다 — 없으면 생략해 소비 쪽 기본값(shareRevenueWithOwner는 true)이 적용된다.
    const insuranceOn = boolOrOmit(raw.insuranceOn)
    if (insuranceOn !== undefined) car.insuranceOn = insuranceOn
    const withholdingOn = boolOrOmit(raw.withholdingOn)
    if (withholdingOn !== undefined) car.withholdingOn = withholdingOn
    if (raw.driverIncomeType === 'employee' || raw.driverIncomeType === 'business') car.driverIncomeType = raw.driverIncomeType
    if (raw.expenseRate !== undefined && isStringOrFiniteNumber(raw.expenseRate)) car.expenseRate = raw.expenseRate
    if (raw.insuranceRate !== undefined && isStringOrFiniteNumber(raw.insuranceRate)) car.insuranceRate = raw.insuranceRate
    if (raw.driverShareBase === 'gross' || raw.driverShareBase === 'afterClientCommission') car.driverShareBase = raw.driverShareBase
    const logEnabled = boolOrOmit(raw.logEnabled)
    if (logEnabled !== undefined) car.logEnabled = logEnabled
    const driverLinkEnabled = boolOrOmit(raw.driverLinkEnabled)
    if (driverLinkEnabled !== undefined) car.driverLinkEnabled = driverLinkEnabled
    const shareRevenueWithOwner = boolOrOmit(raw.shareRevenueWithOwner)
    if (shareRevenueWithOwner !== undefined) car.shareRevenueWithOwner = shareRevenueWithOwner
    const archived = boolOrOmit(raw.archived)
    if (archived !== undefined) car.archived = archived
    // 중첩 객체는 통째로 정본 키셋·타입(isStringRecord, 검증기와 같은 함수)을 만족할 때만 옮기고, 안 맞으면 이 필드만 생략한다(hydrate 전체를 막지 않음 — 사용자 승인).
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
