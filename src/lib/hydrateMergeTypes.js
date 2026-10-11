// @ts-check
// hydrateMerge*.js가 실제로 읽고 쓰는 upstream(Supabase 행·로컬 값) 모양(타입 전용 모듈).
// raw(JSONB) 자리는 모양을 미리 알 수 없어 JsonRecord를 쓴다.
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonRecord} JsonRecord */

/** @typedef {{ message: string, code?: string }|Error|null} SupabaseQueryError */
/** @typedef {Error & { failedTables?: Array<string>, cause?: Record<string, SupabaseQueryError> }} HydrateError */

/** @typedef {{ name?: string, phone?: string, bizName?: string, bizRepresentative?: string, bizNumber?: string, bizAddress?: string, bizType?: string, bizItem?: string, bizEmail?: string, bankName?: string, accountNumber?: string, accountHolder?: string }} LocalProfile */
/** @typedef {{ name?: string, phone?: string, business_name?: string, business_number?: string, business_address?: string, business_type?: string, business_item?: string, business_email?: string, business_representative?: string, bank_name?: string, account_number?: string, account_holder?: string }|null|undefined} ProfileRow */

// LocalCar/LocalClient는 도메인 정본 타입 그대로, RawCarBackup/RawClientBackup은 raw(JSONB)라 Partial — 병합 쪽이 필드마다 typeof로 다시 확인한다.
/** @typedef {import('../domain/financeTypes.js').CarLike} LocalCar */
/** @typedef {Partial<LocalCar>} RawCarBackup */
/** @typedef {import('../domain/clientTypes.js').ClientLike} LocalClient */
/** @typedef {Partial<LocalClient>} RawClientBackup */
// Partial인 이유: mergeDriversFromRows가 병합 전 조회하는 "아직 못 찾았을 수도 있는"
// 로컬 드라이버 폴백이라 `id`까지 전부 optional이어야 한다(DriverRecord.id는
// required라 그대로 쓰면 `local = byCode.get(...) || {}`의 `{}` 대체값이 union을
// 쪼개 프로퍼티 접근마다 타입 에러가 난다). driverName은 레거시 로컬 값 중엔 name
// 대신 여기 저장된 것도 있어 폴백 읽기용으로만 허용한다(DRIVER_KEYS엔 없다 — 정규화
// 결과에는 절대 쓰지 않는다).
/** @typedef {Partial<import('./outboxTypes.js').DriverRecord> & { driverName?: string }} LocalDriver */

/** @typedef {{ id: string|number, raw?: RawCarBackup|null, number?: string, type?: string, tonnage?: string, driver_name?: string, driver_pay_mode?: string|null, driver_salary_amount?: number|string|null, comm_enabled?: boolean, comm_type?: string|null, comm_value?: string|number }} VehicleRow */

/** @typedef {{ id: string|number, raw?: RawClientBackup|null, company_name?: string, legacy_client_id?: string, is_pinned?: boolean }} ClientRow */

/** @typedef {{ id: string|number, invite_code?: string, vehicle_id?: string|number, assignment_start?: string, assignment_end?: string, status?: string, unlink_requested_by?: string|null, unlink_requested_at?: string|null }} DriverLinkRow */

/** @typedef {{ work_date: string, raw?: JsonRecord|null, is_off?: boolean, fixed_count?: number }} DailyLogRow */
/** @typedef {{ work_date: string, raw?: JsonRecord|null }} DetailRow */
/** @typedef {{ isOff: boolean, fixedCount: number, callDetails: Array<JsonRecord>, fuelItems?: Array<JsonRecord>, maintItems?: Array<JsonRecord>, miscItems?: Array<JsonRecord>, assignedVehicleNumber?: string }} MergedDayRecord */

export {}
