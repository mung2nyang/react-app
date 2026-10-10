// @ts-check
// 새 홈 할 일 "오늘 일상점검 안 함": 일지 화면 안내 줄(DailyInspectionNotice)과 같은 조건·같은 서버 읽기. 확인 중·실패면 false(안 보임).
import { useEffect, useState } from 'react'
import { fetchDailyInspection } from '../../lib/dailyInspections.js'
import { vehicleSupabaseIdForLog } from '../../lib/mainDayLogRouting.js'

/**
 * @param {{ ownerKey: string, dateKey: string, enabled: boolean, isOff: boolean }} input
 * @returns {boolean} 서버에서 오늘 점검표가 없다고 확인됐을 때만 true
 */
export default function useTodayInspectionMissing({ ownerKey, dateKey, enabled, isOff }) {
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, 'main')
  const active = enabled && !isOff && ownerKey !== 'guest' && vehicleId != null
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setMissing(false)
    if (!active || vehicleId == null) return undefined
    let alive = true
    fetchDailyInspection(vehicleId, dateKey)
      .then((record) => { if (alive) setMissing(record == null) })
      .catch((error) => { console.error('[useTodayInspectionMissing] 불러오기 실패:', error) })
    return () => { alive = false }
  }, [active, vehicleId, dateKey])

  return active && missing
}
