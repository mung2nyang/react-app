// @ts-check
import { dedupeExpensesById } from '../domain/expenses.js'
// Step 0-4 감사 보완 2차: hydrateFromSupabase가 쓰는 순수 병합 함수들 — "조회 → 검증 →
// 병합(여기) → 커밋"의 병합 단계만 담당하고, localStorage/store 쓰기는 전혀 하지
// 않는다(호출부인 cloudSync.js가 전부 성공적으로 병합된 뒤에만 한 번에 커밋한다).
// 타입 선언은 hydrateMergeTypes.js가 정본이다(200줄 제한 때문에 타입만 뺐다).
/**
 * @typedef {import('./hydrateMergeTypes.js').SupabaseQueryError} SupabaseQueryError
 * @typedef {import('./hydrateMergeTypes.js').HydrateError} HydrateError
 * @typedef {import('./hydrateMergeTypes.js').LocalProfile} LocalProfile
 * @typedef {import('./hydrateMergeTypes.js').ProfileRow} ProfileRow
 * @typedef {import('./hydrateMergeTypes.js').LocalCar} LocalCar
 * @typedef {import('./hydrateMergeTypes.js').RawCarBackup} RawCarBackup
 * @typedef {import('./hydrateMergeTypes.js').VehicleRow} VehicleRow
 * @typedef {import('./hydrateMergeTypes.js').LocalClient} LocalClient
 * @typedef {import('./hydrateMergeTypes.js').ClientRow} ClientRow
 * @typedef {import('./hydrateMergeTypes.js').LocalDriver} LocalDriver
 * @typedef {import('./hydrateMergeTypes.js').DriverLinkRow} DriverLinkRow
 * @typedef {import('./hydrateMergeTypes.js').DailyLogRow} DailyLogRow
 * @typedef {import('./hydrateMergeTypes.js').DetailRow} DetailRow
 * @typedef {import('./hydrateMergeTypes.js').MergedDayRecord} MergedDayRecord
 * @typedef {import('./hydrateMergeTypes.js').JsonRecord} JsonRecord
 * @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike
 */

/**
 * labeled 조회 결과 중 error가 있는 게 하나라도 있으면 던진다. 부분 성공을 허용하지
 * 않는다 — hydrate 전체가 all-or-nothing이어야 부분 snapshot이 로컬을 덮어쓰지 않는다.
 * @param {Record<string, SupabaseQueryError>} labeledErrors { 테이블이름: error 또는 null }
 */
export function throwIfAnyHydrateError(labeledErrors) {
  const failed = Object.entries(labeledErrors).filter(([, error]) => error)
  if (!failed.length) return
  const tables = failed.map(([table]) => table).join(', ')
  const error = /** @type {HydrateError} */ (new Error(`hydrate 조회 실패: ${tables}`))
  error.failedTables = failed.map(([table]) => table)
  error.cause = Object.fromEntries(failed)
  throw error
}

/** @param {LocalProfile} localProfile @param {ProfileRow} profileRow */
export function mergeProfileRow(localProfile, profileRow) {
  return {
    ...localProfile,
    name: profileRow?.name || localProfile.name || '',
    phone: profileRow?.phone || localProfile.phone || '',
    bizName: profileRow?.business_name || localProfile.bizName || '',
    bizNumber: profileRow?.business_number || localProfile.bizNumber || '',
    bizAddress: profileRow?.business_address || localProfile.bizAddress || '',
    bizType: profileRow?.business_type || localProfile.bizType || '',
    bizItem: profileRow?.business_item || localProfile.bizItem || '',
    bizEmail: profileRow?.business_email || localProfile.bizEmail || '',
    bankName: profileRow?.bank_name || localProfile.bankName || '',
    accountNumber: profileRow?.account_number || localProfile.accountNumber || '',
  }
}

export { mergeCarsFromRows } from './hydrateMergeCars.js'
export { mergeClientsFromRows } from './hydrateMergeClients.js'
export { mergeWorkDataFromRows } from './hydrateMergeWork.js'

/**
 * Step 7 후속(재감사) — 예전엔 `...local`(로컬 Store의 기존 드라이버 객체)을 통째로
 * 스프레드했다. Store 드라이버는 이미 DRIVER_KEYS로 정규화돼 있는 게 보통이지만,
 * 스프레드는 "혹시 남아있을 정본 밖 필드"까지 그대로 들여와 다음 initialize에서
 * drivers 도메인 전체를 스키마 실패로 만들 수 있었다 — 이제 DRIVER_KEYS 9개 필드만
 * 명시적으로 채운다. `id: local.id || row.id`도 함께 고쳤다: row.id는 Supabase
 * bigint(number)일 수 있는데 isPersistedDriver는 id를 string으로 요구한다 —
 * local.id가 없으면 String(row.id)로 문자열화한다.
 * @param {Array<LocalDriver>} localDrivers @param {Array<LocalCar>} mergedCars
 * @param {Array<DriverLinkRow>|null|undefined} linkRows 조회 실패 시 배열이 아닐 수 있다
 */
export function mergeDriversFromRows(localDrivers, mergedCars, linkRows) {
  if (!Array.isArray(linkRows)) return localDrivers
  const byCode = new Map((localDrivers || []).map((item) => [item.inviteCode, item]))
  const merged = linkRows.filter((row) => row.status !== 'disconnected').map((row) => {
    const car = (mergedCars || []).find((item) => item.supabaseId === row.vehicle_id)
    const local = byCode.get(row.invite_code) || (localDrivers || []).find((item) => item.supabaseId === row.id) || {}
    return {
      id: local.id || String(row.id),
      supabaseId: row.id,
      inviteCode: row.invite_code || '',
      vehicleNumber: car?.number || local.vehicleNumber || '',
      startDate: row.assignment_start || '',
      endDate: row.assignment_end || '',
      status: /** @type {'pending'|'linked'} */ (row.status === 'linked' ? 'linked' : 'pending'),
      name: local.name || local.driverName || '기사',
      phone: local.phone || '',
    }
  })
  // 슬라이스 B 보완(2026-09-01): linkRows가 배열이면(빈 배열 포함) 서버가 정본이다.
  // merged가 비었다는 건 "서버에 활성 기사 연동이 없다"는 뜻 — 로컬 스냅샷으로
  // 되돌리면 방금 삭제한 기사가 hydrate ~0.6초 뒤 부활한다. localDrivers fallback은
  // linkRows가 배열이 아닐 때(위 early return)만. 서버에 아직 없는 pending 생성 건은
  // reconcileDrivers가 outbox 기준으로 되찾는다.
  return merged
}

/** @param {Array<LocalCar>} cars */
export function findMainCar(cars) {
  return (cars || []).find((car) => car.type === 'main' && car.supabaseId) || (cars || []).find((car) => car.supabaseId) || null
}

/**
 * 비용 한 종류(fuel/maint/misc)를 병합한다. rows가 있으면 그걸 우선하고, 없으면
 * 프로필 스냅샷(설정 백업) → 그래도 없으면 로컬 순으로 fallback한다(기존 동작 유지).
 * @template Row
 * @param {Object} args
 * @param {string} args.kind
 * @param {Array<JsonRecord>} args.currentExpenses
 * @param {Array<{ kind: string }>} [args.snapshotExpenses]
 * @param {Array<{ kind: string }>} [args.previousExpenses]
 * @param {Array<Row>} [args.rows]
 * @param {(row: Row, index: number) => JsonRecord} args.mapRow
 * @param {(currentExpenses: Array<JsonRecord>, keep: Array<JsonRecord>) => Array<JsonRecord>} args.replace
 */
export function mergeExpenseKind({ kind, currentExpenses, snapshotExpenses, previousExpenses, rows, mapRow, replace }) {
  if (rows && rows.length) {
    return dedupeExpensesById(replace(currentExpenses, rows.map((row, index) => mapRow(row, index))))
  }
  const snapshotKind = (snapshotExpenses || []).filter((item) => item.kind === kind)
  const localKind = (previousExpenses || []).filter((item) => item.kind === kind)
  const keep = snapshotKind.length ? snapshotKind : localKind
  return dedupeExpensesById(replace(currentExpenses, keep))
}
