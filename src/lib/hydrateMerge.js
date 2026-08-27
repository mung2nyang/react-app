// Step 0-4 감사 보완 2차: hydrateFromSupabase가 쓰는 순수 병합 함수들. cloudSync.js에서
// 빼낸 이유는 (1) 200줄 제한, (2) 이 함수들은 supabase/cloudUserId 같은 모듈 상태가 전혀
// 필요 없는 진짜 순수 함수라 독립적으로 테스트하기 쉽다. "조회 → 검증 → 병합(여기) →
// 커밋"의 병합 단계만 담당하고, localStorage/store 쓰기는 전혀 하지 않는다 — 호출부
// (cloudSync.js)가 전부 성공적으로 병합된 뒤에만 한 번에 커밋한다.

/**
 * Supabase 쿼리 결과의 error 필드 — 실패하면 보통 { message, code? }나 Error 인스턴스,
 * 성공하면 null이다. any/unknown 대신 이 코드베이스가 실제로 읽는 필드만 적는다.
 * @typedef {{ message: string, code?: string }|Error|null} SupabaseQueryError
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
  const error = new Error(`hydrate 조회 실패: ${tables}`)
  error.failedTables = failed.map(([table]) => table)
  error.cause = Object.fromEntries(failed)
  throw error
}

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

export function mergeCarsFromRows(localCars, vehicleRows) {
  if (!Array.isArray(vehicleRows) || !vehicleRows.length) return localCars
  const cars = vehicleRows.map((row) => {
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {}
    return {
      ...raw,
      id: raw.id || `car-${row.id}`,
      number: row.number || '',
      type: row.type || 'main',
      tonnage: row.tonnage || '',
      supabaseId: row.id,
      driverName: row.driver_name ?? raw.driverName ?? '',
      settlementMode: row.settlement_mode ?? raw.settlementMode ?? null,
      commEnabled: row.comm_enabled ?? !!raw.commEnabled,
      commType: row.comm_type ?? raw.commType ?? null,
      commission: row.comm_value ?? raw.commission ?? '',
    }
  })
  const unsynced = (localCars || []).filter((car) => car && !car.supabaseId)
  return [...cars, ...unsynced]
}

export function mergeClientsFromRows(localClients, clientRows) {
  if (!Array.isArray(clientRows) || !clientRows.length) return localClients
  const clients = clientRows.map((row) => ({
    ...(row.raw && typeof row.raw === 'object' ? row.raw : {}),
    companyName: row.company_name,
    id: row.legacy_client_id || row.id,
    supabaseId: row.id,
    isPinned: row.is_pinned ?? !!(row.raw && row.raw.isPinned),
  }))
  const unsynced = (localClients || []).filter((client) => client && !client.supabaseId)
  return [...clients, ...unsynced]
}

export function mergeDriversFromRows(localDrivers, mergedCars, linkRows) {
  if (!Array.isArray(linkRows)) return localDrivers
  const byCode = new Map((localDrivers || []).map((item) => [item.inviteCode, item]))
  const merged = linkRows.filter((row) => row.status !== 'disconnected').map((row) => {
    const car = (mergedCars || []).find((item) => item.supabaseId === row.vehicle_id)
    const local = byCode.get(row.invite_code) || (localDrivers || []).find((item) => item.supabaseId === row.id) || {}
    return {
      ...local,
      id: local.id || row.id,
      supabaseId: row.id,
      inviteCode: row.invite_code,
      vehicleNumber: car?.number || local.vehicleNumber || '',
      startDate: row.assignment_start || '',
      endDate: row.assignment_end || '',
      status: row.status === 'linked' ? 'linked' : 'pending',
      name: local.name || local.driverName || '기사',
      phone: local.phone || '',
    }
  })
  return merged.length ? merged : localDrivers
}

export function findMainCar(cars) {
  return (cars || []).find((car) => car.type === 'main' && car.supabaseId) || (cars || []).find((car) => car.supabaseId) || null
}

/**
 * daily_logs/transport_details/fuel/maintenance/misc 5개 조회 결과로 workData를
 * 다시 만든다. 호출부가 이미 5개 전부 error 없음을 확인한 뒤에만 부른다 — 특히
 * transport_details가 실패했는데도 callDetails:[]로 기록해 로컬 콜상세를 지워 버리던
 * 버그(감사 지적 2번)를 원천 차단한다: 여기 도달했다는 것 자체가 transportRows가
 * 진짜 서버 응답이라는 뜻이다.
 */
export function mergeWorkDataFromRows(localWorkData, { dailyRows, transportRows, fuelRows, maintRows, miscRows }) {
  const byDate = {}
  ;(dailyRows || []).forEach((row) => {
    byDate[row.work_date] = {
      ...(row.raw && typeof row.raw === 'object' ? row.raw : {}),
      isOff: !!row.is_off,
      fixedCount: row.fixed_count || 0,
      callDetails: [],
      fuelItems: [],
      maintItems: [],
      miscItems: [],
    }
  })
  ;(transportRows || []).forEach((row) => {
    if (!byDate[row.work_date]) return
    byDate[row.work_date].callDetails.push(row.raw && typeof row.raw === 'object' ? row.raw : {})
  })
  ;(fuelRows || []).forEach((row) => {
    if (!byDate[row.work_date]) return
    byDate[row.work_date].fuelItems.push(row.raw && typeof row.raw === 'object' ? row.raw : row)
  })
  ;(maintRows || []).forEach((row) => {
    if (!byDate[row.work_date]) return
    byDate[row.work_date].maintItems.push(row.raw && typeof row.raw === 'object' ? row.raw : row)
  })
  ;(miscRows || []).forEach((row) => {
    if (!byDate[row.work_date]) return
    byDate[row.work_date].miscItems.push(row.raw && typeof row.raw === 'object' ? row.raw : row)
  })
  return { ...(localWorkData || {}), ...byDate }
}

/**
 * 비용 한 종류(fuel/maint/misc)를 병합한다. rows가 있으면 그걸 우선하고, 없으면
 * 프로필 스냅샷(설정 백업) → 그래도 없으면 로컬 순으로 fallback한다(기존 동작 유지).
 */
export function mergeExpenseKind({ kind, currentExpenses, snapshotExpenses, previousExpenses, rows, mapRow, replace }) {
  if ((rows || []).length) {
    return replace(currentExpenses, rows.map((row, index) => mapRow(row, index)))
  }
  const snapshotKind = (snapshotExpenses || []).filter((item) => item.kind === kind)
  const localKind = (previousExpenses || []).filter((item) => item.kind === kind)
  const keep = snapshotKind.length ? snapshotKind : localKind
  return replace(currentExpenses, keep)
}
