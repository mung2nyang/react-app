// @ts-check
// 재감사 3차(FAIL 지적 1번) — syncWorkData.js의 upsert 루프는 로컬 workData에 "있는"
// 날짜만 순회해서, 빈 날 삭제(day-record.js의 saveDayRecord가 그 dateKey를 지우는 것)를
// 서버에 절대 알리지 못했다. 이 파일은 domain/workDataTombstones.js가 기록해 둔
// "아직 서버에 못 알린 삭제" 목록을 순회하며 실제로 daily_logs/transport_details를
// 지운다 — syncQueue.js의 syncAll이 syncWorkData 다음 단계로 부른다. 삭제 실패(또는
// 세션 전환)로 여기서 던지면 syncAll 전체가 실패해 clearDirty가 안 불리고, 'workData'/
// 'workDataDeletedDates' 두 도메인이 dirty로 남는다 — 다음 hydrate가 이미 dirty인
// workData 도메인을 서버 값으로 덮지 않는다(hydrate.js의 기존 dirtyDomains 규칙)는
// 방어에 더해, hydrateMerge.js의 mergeWorkDataFromRows 자신도 이 목록에 있는 날짜를
// 명시적으로 걸러낸다(벨트 앤 서스펜더).
import { supabase } from '../supabaseClient.js'
import { assertSessionStillCurrent } from './cloudSession.js'
import { commitWorkDataDeletedDates } from '../store/commitHelpers.js'
import { readOwnerWorkDataTombstones } from '../store/ownerDataHooks.js'
import { removeWorkDataTombstone } from '../domain/workDataTombstones.js'

/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */
/** @typedef {{ type?: string, supabaseId?: string|number }} CarLike */

/**
 * @param {string} userId
 * @param {string} ownerKey
 * @param {Array<CarLike>} cars
 * @param {SessionCapture} captured 매 원격 await 직후 재검증한다 — 그 사이 로그아웃/
 *   owner 전환이 있었으면 assertSessionStillCurrent가 던져 남은 날짜 처리를 멈춘다.
 */
export async function syncDeletedWorkDates(userId, ownerKey, cars, captured) {
  const mainCar = cars.find((car) => car.type === 'main' && car.supabaseId) || cars.find((car) => car.supabaseId)
  if (!mainCar?.supabaseId) return
  const dateKeys = Object.keys(readOwnerWorkDataTombstones(ownerKey))
  if (!dateKeys.length) return

  for (const workDate of dateKeys) {
    const { data: rows, error: findError } = await supabase
      .from('daily_logs').select('id').eq('vehicle_id', mainCar.supabaseId).eq('work_date', workDate)
    assertSessionStillCurrent(captured)
    if (findError) throw findError

    const ids = (rows || []).map((row) => row.id)
    if (ids.length) {
      const { error: transportError } = await supabase.from('transport_details').delete().in('daily_log_id', ids)
      assertSessionStillCurrent(captured)
      if (transportError) throw transportError

      const { error: dailyError } = await supabase.from('daily_logs').delete().in('id', ids)
      assertSessionStillCurrent(captured)
      if (dailyError) throw dailyError
    }

    // 원격 삭제가 이 날짜까지 확실히 성공한 뒤에만 이 날짜의 tombstone을 지운다 —
    // syncToCloud:false: 방금 서버와 같아진 사실을 로컬에 반영만 할 뿐, 다시 보낼 게
    // 없어서 dirty로 표시하지 않는다(commitBatch가 syncToCloud:false면 dirty journal도
    // 안 건드린다 — store/batchWrites.js).
    commitWorkDataDeletedDates(ownerKey, removeWorkDataTombstone(readOwnerWorkDataTombstones(ownerKey), workDate), { syncToCloud: false })
  }
}
