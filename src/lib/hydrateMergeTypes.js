// @ts-check
// 재감사 4차(FAIL 지적 4번) — hydrateMerge.js에 @ts-check를 붙이면서 200줄을
// 넘겨서(216줄) 타입 선언만 이 파일로 뺐다(clientTypes.js/dayRecordTypes.js와 같은
// 관례, export {}뿐인 타입 전용 모듈). 각 타입은 hydrateMerge.js의 함수가 실제로
// 읽고 쓰는 필드만 적은, "실제로 소비하는 upstream(Supabase row/로컬 값) 모양"에
// 대한 느슨하지만 정직한 인터페이스다 — any/unknown/object 중간단언은 안 썼다.
// 재감사 10차(FAIL 지적 4번) — [key: string]: unknown 인덱스 시그니처(LocalCar/
// RawCarBackup/LocalClient/RawClientBackup)와 raw?: object(DailyLogRow/DetailRow)를
// 걷어냈다. 실제로 이름으로 읽는 필드만 남기고, "JSON.parse가 실제로 돌려줄 수 있는
// 모양"이 필요한 자리(raw 컬럼 — Supabase JSONB, 테이블마다 레거시 모양이 달라
// 컴파일타임에 정확한 필드셋을 모른다)는 pendingWorkDataWritesTypes.js의 JsonRecord
// (durablePatchSchema.js가 이미 쓰는, any/unknown 없이 "미확인 JSON 값"을 표현하는
// 재귀 타입)를 그대로 재사용한다 — 새 회피 수단을 만들지 않는다.
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonRecord} JsonRecord */

/** @typedef {{ message: string, code?: string }|Error|null} SupabaseQueryError */
/** @typedef {Error & { failedTables?: Array<string>, cause?: Record<string, SupabaseQueryError> }} HydrateError */

/** @typedef {{ name?: string, phone?: string, bizName?: string, bizNumber?: string, bizAddress?: string, bizType?: string, bizItem?: string, bizEmail?: string, bankName?: string, accountNumber?: string }} LocalProfile */
/** @typedef {{ name?: string, phone?: string, business_name?: string, business_number?: string, business_address?: string, business_type?: string, business_item?: string, business_email?: string, bank_name?: string, account_number?: string }|null|undefined} ProfileRow */

/** @typedef {{ supabaseId?: string|number, type?: string, number?: string }} LocalCar */
/** @typedef {{ id?: string, driverName?: string, settlementMode?: string|null, commEnabled?: boolean, commType?: string|null, commission?: string|number }} RawCarBackup */
/** @typedef {{ id: string|number, raw?: RawCarBackup|null, number?: string, type?: string, tonnage?: string, driver_name?: string, settlement_mode?: string|null, comm_enabled?: boolean, comm_type?: string|null, comm_value?: string|number }} VehicleRow */

/** @typedef {{ supabaseId?: string|number }} LocalClient */
/** @typedef {{ isPinned?: boolean }} RawClientBackup */
/** @typedef {{ id: string|number, raw?: RawClientBackup|null, company_name?: string, legacy_client_id?: string, is_pinned?: boolean }} ClientRow */

/** @typedef {{ inviteCode?: string, supabaseId?: string|number, id?: string, name?: string, driverName?: string, phone?: string, vehicleNumber?: string }} LocalDriver */
/** @typedef {{ id: string|number, invite_code?: string, vehicle_id?: string|number, assignment_start?: string, assignment_end?: string, status?: string }} DriverLinkRow */

/** @typedef {{ work_date: string, raw?: JsonRecord|null, is_off?: boolean, fixed_count?: number }} DailyLogRow */
/** @typedef {{ work_date: string, raw?: JsonRecord|null }} DetailRow */
/** @typedef {{ isOff: boolean, fixedCount: number, callDetails: Array<JsonRecord>, fuelItems: Array<JsonRecord>, maintItems: Array<JsonRecord>, miscItems: Array<JsonRecord> }} MergedDayRecord */

export {}
