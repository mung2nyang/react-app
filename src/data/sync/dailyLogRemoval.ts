// 빈 날이 된 그 날짜 지우기 — 서버 함수 remove_day_log(DB 0030) 한 번. 그날 지출이 있으면 서버가 줄을 빈 기록으로 남긴다.
import { supabase } from '../cloud/supabaseClient.ts'

/** 빈 날이 된 그 날짜의 콜 상세와 하루 기록 줄을 한 번에 지운다(지출이 있으면 줄은 빈 기록으로, 멱등). */
export async function removeDayLogOnServer(vehicleId: number | string, workDate: string) {
  const { error } = await supabase.rpc('remove_day_log', { p_vehicle_id: vehicleId, p_work_date: workDate })
  if (error) throw error
}
