// 일지 한 줄(daily_logs)에 보낼 값 — 로그인 일지 저장이 쓴다.
import type { JsonValue } from '../../domain/jsonTypes.ts'
import { parseEntityNumber } from '../cloud/cloudStorage.ts'

export function dailyLogRow(userId: string, vehicleId: string | number, workDate: string, record: JsonValue | undefined): Record<string, JsonValue> {
  const safeRecord = (record && typeof record === 'object' ? record : { isOff: false, fixedCount: 0 }) as Record<string, JsonValue | undefined>
  const { callDetails: _callDetails, fuelItems: _fuelItems, maintItems: _maintItems, miscItems: _miscItems, ...dailyFields } = safeRecord
  return {
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    is_off: !!safeRecord.isOff,
    fixed_count: parseEntityNumber(safeRecord.fixedCount),
    pallet_count: parseEntityNumber(safeRecord.palletCount),
    raw: (dailyFields) as JsonValue,
  }
}
