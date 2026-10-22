// hydrate가 차량별 daily_logs를 logId 맵으로 합친다.
import { findMainCar, mergeWorkDataFromRows } from './hydrateMerge.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { DailyLogRow, DetailRow, SupabaseQueryError } from './hydrateMergeTypes.ts'

/** Car -> Store logId. main -> 'main', sub -> plate number, else null. */
export function logIdForCar(car: CarLike): string | null {
  if (car?.type === 'main') return 'main'
  const number = String(car?.number || '').trim()
  if (!number || number === 'main') return null
  return number
}

export async function mergeVehicleDayLogsFromServer({ cars, mainTombstoneKeys, fetchDaily, fetchTransport, throwIfAnyHydrateError }: {
  cars: Array<CarLike>,
  mainTombstoneKeys: string[],
  fetchDaily: (vehicleId: number | string) => PromiseLike<{ data: Array<DailyLogRow> | null, error: SupabaseQueryError }>,
  fetchTransport: (vehicleId: number | string) => PromiseLike<{ data: Array<DetailRow> | null, error: SupabaseQueryError }>,
  throwIfAnyHydrateError: (errors: Record<string, SupabaseQueryError>) => void,
}): Promise<{ workLogs: Record<string, Record<string, DayRecordLike>>, mainCar: CarLike | null }> {
  const workLogs: Record<string, Record<string, DayRecordLike>> = { main: {} }
  const withId = (cars || []).filter((car) => car?.supabaseId != null)
  const fetched = await Promise.all(withId.map(async (car) => {
    const vehicleId = (car.supabaseId) as number | string
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
