// 일지 한 줄(daily_logs) 저장 — 로그인 일지·지출 저장이 같이 쓴다.
import type { JsonValue } from '../../domain/jsonTypes.ts'
import { supabase } from '../cloud/supabaseClient.ts'
import { parseEntityNumber } from '../cloud/cloudStorage.ts'

export async function upsertDailyLog(userId: string, vehicleId: string | number, workDate: string, record: JsonValue | undefined): Promise<string> {
  const safeRecord = (record && typeof record === 'object' ? record : { isOff: false, fixedCount: 0 }) as Record<string, JsonValue | undefined>
  const { callDetails: _callDetails, fuelItems: _fuelItems, maintItems: _maintItems, miscItems: _miscItems, ...dailyFields } = safeRecord
  const { data, error } = await supabase.from('daily_logs').upsert({
    user_id: userId,
    vehicle_id: vehicleId,
    work_date: workDate,
    is_off: !!safeRecord.isOff,
    fixed_count: parseEntityNumber(safeRecord.fixedCount),
    pallet_count: parseEntityNumber(safeRecord.palletCount),
    raw: dailyFields,
  }, { onConflict: 'vehicle_id,work_date' }).select('id').single()
  if (error) throw error
  // .single()은 성공 시 정확히 1행을 보장 — error가 없으면 data는 non-null.
  return (data?.id) as string
}
