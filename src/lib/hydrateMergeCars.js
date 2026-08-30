// @ts-check
/** @typedef {import('./hydrateMergeTypes.js').LocalCar} LocalCar */
/** @typedef {import('./hydrateMergeTypes.js').RawCarBackup} RawCarBackup */
/** @typedef {import('./hydrateMergeTypes.js').VehicleRow} VehicleRow */

/** @param {string|null|undefined} value */
function settlementModeFromHydrate(value) {
  return typeof value === 'string' && value ? value : 'default'
}

/** @param {string|null|undefined} value */
function commTypeFromHydrate(value) {
  return value === 'direct' ? 'direct' : 'percent'
}

/** @param {Array<LocalCar>} localCars @param {Array<VehicleRow>|null|undefined} vehicleRows */
export function mergeCarsFromRows(localCars, vehicleRows) {
  if (!Array.isArray(vehicleRows) || !vehicleRows.length) return localCars
  const cars = vehicleRows.map((row) => {
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : /** @type {RawCarBackup} */ ({})
    return {
      ...raw,
      id: raw.id || `car-${row.id}`,
      number: row.number || '',
      type: row.type === 'sub' ? 'sub' : 'main',
      tonnage: row.tonnage || '',
      supabaseId: row.id,
      driverName: row.driver_name ?? raw.driverName ?? '',
      settlementMode: settlementModeFromHydrate(row.settlement_mode ?? raw.settlementMode),
      commEnabled: row.comm_enabled ?? !!raw.commEnabled,
      commType: commTypeFromHydrate(row.comm_type ?? raw.commType),
      commission: row.comm_value ?? raw.commission ?? '',
    }
  })
  const unsynced = (localCars || []).filter((car) => car && !car.supabaseId)
  return [...cars, ...unsynced]
}
