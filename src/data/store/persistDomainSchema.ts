import * as v from 'valibot'
import { isValidCalendarDateKey } from '../../domain/dateKey.ts'
import { bool, by, finiteNumber, opt, plain, str, stringOrNumber } from '../../domain/schemaParts.ts'
import { isPersistedWorkDataMap } from './persistDayRecord.ts'
import { isPersistedInvoice } from './persistDomainInvoice.ts'
import { isPersistedCar, isPersistedClient, isPersistedDriver, isPersistedExpense } from './persistDomainRecords.ts'
import { DRIVER_INVOICE_BASES, DRIVER_SETTLEMENT_MODES } from './persistDomainEnums.ts'
import type { PersistDomain } from './persist.ts'
import type { JsonValue } from '../../domain/jsonTypes.ts'

export type LocalProfile = {
  name?: string, phone?: string, bizName?: string, bizRepresentative?: string, bizNumber?: string,
  bizAddress?: string, bizType?: string, bizItem?: string, bizEmail?: string, bankName?: string,
  accountNumber?: string, accountHolder?: string
}

// 칸 이름 → 모양(Valibot, 공용 조각은 domain/schemaParts.ts). 목록 밖 칸·값이 비어 있는 칸은 거부.

const DRIVER_LINK = plain(v.strictObject({
  id: opt(str), vehicleNumber: opt(str), assignmentStart: opt(str), assignmentEnd: opt(str), status: opt(str),
}))

const ROUTE_PRESET = plain(v.strictObject({ id: str, loadLoc: str, unloadLoc: str }))

const INPUT_MODE = v.picklist(['count', 'fare'])

const SUB_CAR_SETTINGS = plain(v.strictObject({
  inputMode: opt(INPUT_MODE), callDetail: opt(bool), timeOn: opt(bool), platformOn: opt(bool),
  distanceOn: opt(bool), cargoTonnageOn: opt(bool), dailyInspectionOn: opt(bool),
}))

const SETTINGS = plain(v.strictObject({
  cars: opt(v.array(by(isPersistedCar))), clients: opt(v.array(by(isPersistedClient))), driverLinks: opt(v.array(DRIVER_LINK)),
  paymentOn: opt(bool), subPaymentOn: opt(bool), fixedOn: opt(bool), subFixedOn: opt(bool),
  // defaultDriverSettlementMode: 옛 "계산서 처리 방식" 기본값(2026-10-02 삭제) — 옛 저장분 읽기용.
  defaultDriverSettlementMode: opt(v.picklist(DRIVER_SETTLEMENT_MODES)),
  // driverInvoiceBasis: 옛 기사 매입 계산서 기준(2026-10-02 삭제) — 옛 저장분 읽기용.
  driverInvoiceBasis: opt(v.picklist(DRIVER_INVOICE_BASES)),
  unitPrice: opt(stringOrNumber),
  bizName: opt(str), bizNumber: opt(str), bizRepresentative: opt(str), userName: opt(str),
  bizAddress: opt(str), bizType: opt(str), bizItem: opt(str), bizEmail: opt(str),
  theme: opt(v.picklist(['light', 'dark'])), inputMode: opt(INPUT_MODE),
  callDetail: opt(bool), timeOn: opt(bool), platformOn: opt(bool), distanceOn: opt(bool), cargoTonnageOn: opt(bool),
  fixedRouteOn: opt(bool), fixedRoutePresets: opt(v.array(ROUTE_PRESET)), runCountToggle: opt(bool), runCountPresets: opt(v.array(finiteNumber)),
  subFixedRouteOn: opt(bool), subFixedRoutePresets: opt(v.array(ROUTE_PRESET)), subRunCountToggle: opt(bool), subRunCountPresets: opt(v.array(finiteNumber)),
  pinnedLocations: opt(v.array(str)), subCarSettings: opt(plain(v.record(str, SUB_CAR_SETTINGS))),
  dailyInspectionOn: opt(bool), notifOff: opt(v.array(str)),
}))

/** data/sync/profileSave.ts EMPTY_PROFILE + PersonalInfoPage 저장 필드와 동일하다. */
const PROFILE = plain(v.strictObject({
  name: opt(str), phone: opt(str), bizName: opt(str), bizRepresentative: opt(str), bizNumber: opt(str), bizAddress: opt(str),
  bizType: opt(str), bizItem: opt(str), bizEmail: opt(str), bankName: opt(str), accountNumber: opt(str), accountHolder: opt(str),
}))

const DELETED_DATES = plain(v.record(v.pipe(str, v.check(isValidCalendarDateKey)), str))

export function isPersistedSettings(value: JsonValue) {
  return v.is(SETTINGS, value)
}

export function isPersistedProfile(value: JsonValue): value is LocalProfile {
  return v.is(PROFILE, value)
}

export function isPersistedWorkDataDeletedDates(value: JsonValue) {
  return v.is(DELETED_DATES, value)
}

export function matchesDomainSchema(domain: PersistDomain, parsed: JsonValue) {
  if (domain === 'dismissedNotifications') return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
  if (domain === 'cars') return Array.isArray(parsed) && parsed.every(isPersistedCar)
  if (domain === 'clients') return Array.isArray(parsed) && parsed.every(isPersistedClient)
  if (domain === 'expenses') return Array.isArray(parsed) && parsed.every(isPersistedExpense)
  if (domain === 'invoices') return Array.isArray(parsed) && parsed.every(isPersistedInvoice)
  if (domain === 'drivers') return Array.isArray(parsed) && parsed.every(isPersistedDriver)
  if (domain === 'settings') return isPersistedSettings(parsed)
  if (domain === 'profile') return isPersistedProfile(parsed)
  if (domain === 'workDataDeletedDates') return isPersistedWorkDataDeletedDates(parsed)
  if (domain === 'workData') return isPersistedWorkDataMap(parsed)
  return false
}
