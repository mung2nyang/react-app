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

/** @typedef {{ name?: string, phone?: string, bizName?: string, bizRepresentative?: string, bizNumber?: string, bizAddress?: string, bizType?: string, bizItem?: string, bizEmail?: string, bankName?: string, accountNumber?: string, accountHolder?: string }} LocalProfile */
/** @typedef {{ name?: string, phone?: string, business_name?: string, business_number?: string, business_address?: string, business_type?: string, business_item?: string, business_email?: string, bank_name?: string, account_number?: string }|null|undefined} ProfileRow */

// Step 7 후속(hydrate producer 정규화, 2026-08-31) — LocalCar/LocalClient/LocalDriver는 이제
// 각 도메인의 정본 타입(CarLike/ClientLike/DriverRecord — persistDomainRecords.js의
// CAR_KEYS/CLIENT_KEYS/DRIVER_KEYS와 1:1)을 그대로 재사용한다. RawCarBackup/
// RawClientBackup은 Supabase raw(JSONB) 컬럼 — 같은 필드 구성이지만 전부 "있을 수도,
// 틀린 타입일 수도 있는 미확인 JSON"이라 Partial로 전부 optional화한다(hydrateMergeCars.js/
// hydrateMergeClients.js가 필드마다 typeof로 다시 방어한다 — JSDoc 선언을 무조건
// 신뢰하지 않는다).
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

/** @typedef {{ id: string|number, raw?: RawCarBackup|null, number?: string, type?: string, tonnage?: string, driver_name?: string, settlement_mode?: string|null, comm_enabled?: boolean, comm_type?: string|null, comm_value?: string|number }} VehicleRow */

/** @typedef {{ id: string|number, raw?: RawClientBackup|null, company_name?: string, legacy_client_id?: string, is_pinned?: boolean }} ClientRow */

/** @typedef {{ id: string|number, invite_code?: string, vehicle_id?: string|number, assignment_start?: string, assignment_end?: string, status?: string }} DriverLinkRow */

/** @typedef {{ work_date: string, raw?: JsonRecord|null, is_off?: boolean, fixed_count?: number }} DailyLogRow */
/** @typedef {{ work_date: string, raw?: JsonRecord|null }} DetailRow */
/** @typedef {{ isOff: boolean, fixedCount: number, callDetails: Array<JsonRecord>, fuelItems?: Array<JsonRecord>, maintItems?: Array<JsonRecord>, miscItems?: Array<JsonRecord> }} MergedDayRecord */

export {}
