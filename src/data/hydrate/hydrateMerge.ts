import { dedupeExpensesById } from '../../domain/expenses.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'
// hydrateFromSupabase의 순수 병합 함수(조회 → 검증 → 병합 → 커밋 중 병합만). localStorage/store는 쓰지 않는다. 타입 정본은 hydrateMergeTypes.ts.
import type {
  DriverLinkRow, HydrateError, JsonRecord, LocalCar, LocalDriver, LocalProfile, ProfileRow, SupabaseQueryError,
} from './hydrateMergeTypes.ts'

/**
 * labeled 조회 결과 중 error가 있는 게 하나라도 있으면 던진다. 부분 성공을 허용하지
 * 않는다 — hydrate 전체가 all-or-nothing이어야 부분 snapshot이 로컬을 덮어쓰지 않는다.
 * @param labeledErrors { 테이블이름: error 또는 null }
 */
export function throwIfAnyHydrateError(labeledErrors: Record<string, SupabaseQueryError>) {
  const failed = Object.entries(labeledErrors).filter(([, error]) => error)
  if (!failed.length) return
  const tables = failed.map(([table]) => table).join(', ')
  const error = (new Error(`hydrate 조회 실패: ${tables}`)) as HydrateError
  error.failedTables = failed.map(([table]) => table)
  error.cause = Object.fromEntries(failed)
  throw error
}

export function mergeProfileRow(localProfile: LocalProfile, profileRow: ProfileRow) {
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
    bizRepresentative: profileRow?.business_representative || localProfile.bizRepresentative || '',
    bankName: profileRow?.bank_name || localProfile.bankName || '',
    accountNumber: profileRow?.account_number || localProfile.accountNumber || '',
    accountHolder: profileRow?.account_holder || localProfile.accountHolder || '',
  }
}

export { mergeCarsFromRows } from './hydrateMergeCars.ts'
export { mergeClientsFromRows } from './hydrateMergeClients.ts'
export { mergeWorkDataFromRows } from './hydrateMergeWork.ts'

/**
 * DRIVER_KEYS 9개 필드만 명시적으로 채운다 — 로컬 객체를 통째로 펼치면 정본 밖 필드가 섞여 다음 initialize에서 drivers 전체가 스키마 실패한다.
 * row.id(숫자일 수 있음)는 String으로 바꾼다(isPersistedDriver는 문자열 id 요구).
 * @param linkRows 조회 실패 시 배열이 아닐 수 있다
 * @returns 조회 실패 시엔 이미 정규화된 로컬 목록을 그대로 통과시킨다
 */
export function mergeDriversFromRows(localDrivers: Array<LocalDriver>, mergedCars: Array<LocalCar>, linkRows: Array<DriverLinkRow> | null | undefined): Array<DriverRecord> {
  if (!Array.isArray(linkRows)) return (localDrivers) as Array<DriverRecord>
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
      status: (row.status === 'linked' ? 'linked' : 'pending') as 'pending' | 'linked',
      name: car?.driverName || local.name || local.driverName || '기사',
      phone: car?.driverPhone || local.phone || '',
      unlinkRequestedBy: row.unlink_requested_by || '',
      unlinkRequestedAt: row.unlink_requested_at || '',
    }
  })
  // linkRows가 배열이면(빈 배열 포함) 서버가 정본 — 로컬로 되돌리면 방금 삭제한 기사가 hydrate 뒤 부활한다.
  return merged
}

export function findMainCar(cars: Array<LocalCar>) {
  return (cars || []).find((car) => car.type === 'main' && car.supabaseId) || (cars || []).find((car) => car.supabaseId) || null
}

/**
 * 비용 한 종류(fuel/maint/misc)를 병합한다. rows가 있으면 그걸 우선하고, 없으면
 * 프로필 스냅샷(설정 백업) → 그래도 없으면 로컬 순으로 fallback한다(기존 동작 유지).
 */
export function mergeExpenseKind<Row>({ kind, currentExpenses, snapshotExpenses, previousExpenses, rows, mapRow, replace }: {
  kind: string,
  currentExpenses: Array<JsonRecord>,
  snapshotExpenses?: Array<{ kind: string }>,
  previousExpenses?: Array<{ kind: string }>,
  rows?: Array<Row>,
  mapRow: (row: Row, index: number) => JsonRecord,
  replace: (currentExpenses: Array<JsonRecord>, keep: Array<JsonRecord>) => Array<JsonRecord>,
}) {
  if (rows && rows.length) {
    return dedupeExpensesById(replace(currentExpenses, rows.map((row, index) => mapRow(row, index))))
  }
  const snapshotKind = (snapshotExpenses || []).filter((item) => item.kind === kind)
  const localKind = (previousExpenses || []).filter((item) => item.kind === kind)
  const keep = snapshotKind.length ? snapshotKind : localKind
  return dedupeExpensesById(replace(currentExpenses, keep))
}
