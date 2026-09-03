// @ts-check
// Step 9 slice A: hydrate merges daily_logs per vehicle into logId maps.
import { findMainCar, mergeWorkDataFromRows } from './hydrateMerge.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('./hydrateMergeTypes.js').DailyLogRow} DailyLogRow */
/** @typedef {import('./hydrateMergeTypes.js').DetailRow} DetailRow */

/**
 * Car -> Store logId. main -> 'main', sub -> plate number, else null.
 * @param {CarLike} car
 * @returns {string|null}
 */
export function logIdForCar(car) {
  if (car?.type === 'main') return 'main'
  const number = String(car?.number || '').trim()
  if (!number || number === 'main') return null
  return number
}

/**
 * @param {object} params
 * @param {Array<CarLike>} params.cars
 * @param {string[]} params.mainTombstoneKeys
 * @param {(vehicleId: number|string) => PromiseLike<{ data: Array<DailyLogRow>|null, error: { message?: string }|null }>} params.fetchDaily
 * @param {(vehicleId: number|string) => PromiseLike<{ data: Array<DetailRow>|null, error: { message?: string }|null }>} params.fetchTransport
 * @param {(errors: Record<string, any>) => void} params.throwIfAnyHydrateError
 * @returns {Promise<{ workLogs: Record<string, Record<string, DayRecordLike>>, mainCar: CarLike|null }>}
 */
export async function mergeVehicleDayLogsFromServer({ cars, mainTombstoneKeys, fetchDaily, fetchTransport, throwIfAnyHydrateError }) {
  /** @type {Record<string, Record<string, DayRecordLike>>} */
  const workLogs = { main: {} }
  const withId = (cars || []).filter((car) => car?.supabaseId != null)
  const fetched = await Promise.all(withId.map(async (car) => {
    const vehicleId = /** @type {number|string} */ (car.supabaseId)
    const [dailyRes, transportRes] = await Promise.all([fetchDaily(vehicleId), fetchTransport(vehicleId)])
    return { car, dailyRes, transportRes }
  }))

  for (const { car, dailyRes, transportRes } of fetched) {
    const logId = logIdForCar(car)
    if (!logId) continue
    throwIfAnyHydrateError({
      ['daily_logs:' + logId]: dailyRes.error,
      ['transport_details:' + logId]: transportRes.error,
    })
    const deletedKeys = logId === 'main' ? mainTombstoneKeys : []
    workLogs[logId] = mergeWorkDataFromRows(
      {},
      { dailyRows: dailyRes.data, transportRows: transportRes.data || [] },
      deletedKeys,
    )
  }

  return { workLogs, mainCar: findMainCar(cars) }
}