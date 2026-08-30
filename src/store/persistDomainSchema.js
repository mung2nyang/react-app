// @ts-check
import { isValidCalendarDateKey } from '../domain/dateKey.js'
import { isPersistedWorkDataMap } from './persistDayRecord.js'
import { isPersistedInvoice } from './persistDomainInvoice.js'
import {
  hasOnlyKeys, isFiniteNumber, isPersistedCar, isPersistedClient, isPersistedDriver,
  isPersistedExpense, isPlainObject, isStringOrFiniteNumber,
} from './persistDomainRecords.js'
import { DRIVER_INVOICE_BASES, DRIVER_SETTLEMENT_MODES, isAllowedEnum } from './persistDomainEnums.js'

/** @typedef {import('./persist.js').PersistDomain} PersistDomain */
/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

const DRIVER_LINK_KEYS = ['id', 'vehicleNumber', 'assignmentStart', 'assignmentEnd', 'status']
const ROUTE_PRESET_KEYS = ['id', 'loadLoc', 'unloadLoc']
const SETTINGS_KEYS = [
  'cars', 'clients', 'driverLinks', 'paymentOn', 'subPaymentOn', 'fixedOn', 'subFixedOn',
  'defaultDriverSettlementMode', 'driverInvoiceBasis', 'unitPrice', 'bizName', 'bizNumber',
  'bizRepresentative', 'userName', 'bizAddress', 'bizType', 'bizItem', 'bizEmail', 'theme',
  'inputMode', 'callDetail', 'timeOn', 'platformOn', 'distanceOn', 'cargoTonnageOn', 'fixedRouteOn',
  'fixedRoutePresets', 'runCountToggle', 'runCountPresets', 'subFixedRouteOn', 'subFixedRoutePresets',
  'subRunCountToggle', 'subRunCountPresets',
]
/** lib/profile.js emptyProfile + PersonalInfoPage 저장 필드와 동일하다. */
const PROFILE_KEYS = [
  'name', 'phone', 'bizName', 'bizRepresentative', 'bizNumber', 'bizAddress', 'bizType', 'bizItem',
  'bizEmail', 'bankName', 'accountNumber', 'accountHolder',
]
/**
 * @typedef {{
 *   name?: string, phone?: string, bizName?: string, bizRepresentative?: string, bizNumber?: string,
 *   bizAddress?: string, bizType?: string, bizItem?: string, bizEmail?: string, bankName?: string,
 *   accountNumber?: string, accountHolder?: string
 * }} LocalProfile
 */

/** @param {JsonValue} value */
function isPersistedDriverLink(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, DRIVER_LINK_KEYS)) return false
  return Object.values(value).every((field) => typeof field === 'string')
}

/** @param {JsonValue} value */
function isRoutePreset(value) {
  return isPlainObject(value) && hasOnlyKeys(value, ROUTE_PRESET_KEYS)
    && typeof value.id === 'string' && typeof value.loadLoc === 'string' && typeof value.unloadLoc === 'string'
}

/** @param {JsonValue} value */
export function isPersistedSettings(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, SETTINGS_KEYS)) return false
  if ('theme' in value && value.theme !== 'light' && value.theme !== 'dark') return false
  if ('inputMode' in value && value.inputMode !== 'count' && value.inputMode !== 'fare') return false
  if ('unitPrice' in value && !isStringOrFiniteNumber(value.unitPrice)) return false
  for (const flag of ['paymentOn', 'subPaymentOn', 'fixedOn', 'subFixedOn', 'callDetail', 'timeOn', 'platformOn', 'distanceOn', 'cargoTonnageOn', 'fixedRouteOn', 'runCountToggle', 'subFixedRouteOn', 'subRunCountToggle']) {
    if (flag in value && typeof value[flag] !== 'boolean') return false
  }
  if ('defaultDriverSettlementMode' in value && !isAllowedEnum(value.defaultDriverSettlementMode, DRIVER_SETTLEMENT_MODES)) return false
  if ('driverInvoiceBasis' in value && !isAllowedEnum(value.driverInvoiceBasis, DRIVER_INVOICE_BASES)) return false
  for (const text of ['bizName', 'bizNumber', 'bizRepresentative', 'userName', 'bizAddress', 'bizType', 'bizItem', 'bizEmail']) {
    if (text in value && typeof value[text] !== 'string') return false
  }
  if ('cars' in value && (!Array.isArray(value.cars) || !value.cars.every(isPersistedCar))) return false
  if ('clients' in value && (!Array.isArray(value.clients) || !value.clients.every(isPersistedClient))) return false
  if ('driverLinks' in value && (!Array.isArray(value.driverLinks) || !value.driverLinks.every(isPersistedDriverLink))) return false
  if ('fixedRoutePresets' in value && (!Array.isArray(value.fixedRoutePresets) || !value.fixedRoutePresets.every(isRoutePreset))) return false
  if ('subFixedRoutePresets' in value && (!Array.isArray(value.subFixedRoutePresets) || !value.subFixedRoutePresets.every(isRoutePreset))) return false
  if ('runCountPresets' in value && (!Array.isArray(value.runCountPresets) || !value.runCountPresets.every(isFiniteNumber))) return false
  if ('subRunCountPresets' in value && (!Array.isArray(value.subRunCountPresets) || !value.subRunCountPresets.every(isFiniteNumber))) return false
  return true
}

/** @param {JsonValue} value @returns {value is LocalProfile} */
export function isPersistedProfile(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, PROFILE_KEYS)) return false
  return Object.values(value).every((field) => typeof field === 'string')
}

/** @param {JsonValue} value */
export function isPersistedWorkDataDeletedDates(value) {
  if (!isPlainObject(value)) return false
  return Object.entries(value).every(([dateKey, stampedAt]) => isValidCalendarDateKey(dateKey) && typeof stampedAt === 'string')
}

/**
 * @param {PersistDomain} domain
 * @param {JsonValue} parsed
 */
export function matchesDomainSchema(domain, parsed) {
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
