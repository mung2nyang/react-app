// @ts-check
/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

export const CAR_SETTLEMENT_MODES = /** @type {const} */ ([
  'default', 'company', 'driver_direct', 'employee', 'none',
])
export const COMM_TYPES = /** @type {const} */ (['percent', 'direct'])
export const INFO_TYPES = /** @type {const} */ (['existing', 'new'])
export const PAYMENT_TERM_VALUES = /** @type {const} */ ([
  'same_day', 'after_days', 'next_month_day', 'next_month_end', 'second_month_day', 'second_month_end',
])
export const DRIVER_PAY_MODES = /** @type {const} */ (['revenue', 'salary'])
export const DRIVER_SETTLEMENT_MODES = /** @type {const} */ ([
  'company', 'driver_direct', 'employee', 'none',
])
export const DRIVER_INVOICE_BASES = /** @type {const} */ (['net', 'gross'])
export const INVOICE_FLOWS = /** @type {const} */ (['sales', 'purchase', 'commission'])
export const INVOICE_STATUSES = /** @type {const} */ (['draft', 'issued'])
export const PARTY_TYPES = /** @type {const} */ (['client', 'driver'])

/**
 * @param {JsonValue} value
 * @param {ReadonlyArray<string>} allowed
 */
export function isAllowedEnum(value, allowed) {
  return typeof value === 'string' && allowed.includes(value)
}
