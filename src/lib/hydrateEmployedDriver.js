// @ts-check
// employed_driver hydrate: use RPCs instead of profiles/vehicles row SELECT.
// Skip clients / fuel / maint / misc / tax invoices (least privilege).
import { normalizeSettings } from '../domain/practiceSettings.js'
import {
  fetchAssignedVehicleSummary,
  fetchLinkedOwnerProfileSettings,
} from './driverLinkRpc.js'
import { mergeDriversFromRows } from './hydrateMerge.js'
import { mergeVehicleDayLogsFromServer } from './hydrateVehicleDayLogs.js'
import { supabase } from '../supabaseClient.js'

/** @typedef {import('./hydrateMergeTypes.js').LocalCar} LocalCar */
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */

/**
 * @param {{ id: string, number?: string, type?: string, tonnage?: string, settlement_mode?: string|null, driver_pay_mode?: string|null, driver_salary_amount?: number|string|null, comm_enabled?: boolean|null, comm_type?: string|null, comm_value?: string|number|null }} row
 * @returns {LocalCar}
 */
export function carFromAssignedSummary(row) {
  return {
    id: `car-${row.id}`,
    number: row.number || '',
    type: row.type === 'main' ? 'main' : 'sub',
    tonnage: row.tonnage || '',
    supabaseId: row.id,
    settlementMode: row.settlement_mode || 'default',
    driverPayMode: row.driver_pay_mode || 'revenue',
    driverSalaryAmount: row.driver_salary_amount ?? '',
    commEnabled: !!row.comm_enabled,
    commType: row.comm_type || 'percent',
    commission: row.comm_value ?? '',
    infoType: 'existing',
    driverName: '',
    driverPhone: '',
    driverLinkId: '',
  }
}

/**
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.ownerKey
 * @param {(labeled: Record<string, import('./hydrateMergeTypes.js').SupabaseQueryError>) => void} args.throwIfAnyHydrateError
 * @param {string|null|undefined} [args.driverPhone]
 * @param {Array<DriverRecord>} args.localDrivers
 */
export async function buildEmployedDriverSnapshot({
  userId, ownerKey, throwIfAnyHydrateError, driverPhone, localDrivers,
}) {
  const [ownerProfile, vehicleRows, linksRes, selfProfileRes] = await Promise.all([
    fetchLinkedOwnerProfileSettings(ownerKey),
    fetchAssignedVehicleSummary(),
    supabase.from('driver_links').select('*').eq('driver_id', userId).eq('status', 'linked'),
    supabase.from('profiles').select('phone').eq('id', userId).maybeSingle(),
  ])
  throwIfAnyHydrateError({
    driver_links: linksRes.error,
    profiles_self: selfProfileRes.error,
  })

  /** @type {Record<string, unknown>} */
  const settingsJson = (ownerProfile?.settings && typeof ownerProfile.settings === 'object'
    && !Array.isArray(ownerProfile.settings))
    ? /** @type {Record<string, unknown>} */ (ownerProfile.settings)
    : {}
  const themeRaw = settingsJson.theme
  const nextSettings = normalizeSettings({
    ...settingsJson,
    theme: (themeRaw === 'dark' || themeRaw === 'light') ? themeRaw : 'light',
  })
  const nextProfile = {
    name: ownerProfile?.name || '',
    phone: '',
    bizName: ownerProfile?.business_name || '',
  }
  /** @type {Array<LocalCar>} */
  const nextCars = (vehicleRows || []).map((row) => carFromAssignedSummary(row))
  let nextDrivers = /** @type {Array<DriverRecord>} */ (
    mergeDriversFromRows(localDrivers, nextCars, linksRes.data || [])
  )
  const phone = String(driverPhone || selfProfileRes.data?.phone || '').trim()
  if (phone) {
    nextDrivers = nextDrivers.map((driver) => (
      driver.status === 'linked' && !driver.phone ? { ...driver, phone } : driver
    ))
  }

  const { workLogs } = await mergeVehicleDayLogsFromServer({
    cars: nextCars,
    mainTombstoneKeys: [],
    fetchDaily: (vehicleId) => supabase.from('daily_logs').select('*').eq('vehicle_id', vehicleId),
    fetchTransport: (vehicleId) => supabase
      .from('transport_details')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('sequence', { ascending: true }),
    throwIfAnyHydrateError,
  })

  return {
    workData: workLogs.main || {},
    workLogs,
    cars: nextCars,
    clients: [],
    drivers: nextDrivers,
    profile: nextProfile,
    settings: nextSettings,
    expenses: [],
    invoices: [],
  }
}