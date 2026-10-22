// hydrateMerge*.ts가 실제로 읽고 쓰는 upstream(Supabase 행·로컬 값) 모양(타입 전용 모듈).
// raw(JSONB) 자리는 모양을 미리 알 수 없어 JsonRecord를 쓴다.
import type { JsonRecord } from '../../domain/jsonTypes.ts'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'

export type { JsonRecord }

export type SupabaseQueryError = { message: string, code?: string } | Error | null
export type HydrateError = Error & { failedTables?: Array<string>, cause?: Record<string, SupabaseQueryError> }

export type LocalProfile = { name?: string, phone?: string, bizName?: string, bizRepresentative?: string, bizNumber?: string, bizAddress?: string, bizType?: string, bizItem?: string, bizEmail?: string, bankName?: string, accountNumber?: string, accountHolder?: string }
export type ProfileRow = { name?: string, phone?: string, business_name?: string, business_number?: string, business_address?: string, business_type?: string, business_item?: string, business_email?: string, business_representative?: string, bank_name?: string, account_number?: string, account_holder?: string } | null | undefined

// LocalCar/LocalClient는 도메인 정본 타입 그대로, RawCarBackup/RawClientBackup은 raw(JSONB)라 Partial — 병합 쪽이 필드마다 typeof로 다시 확인한다.
export type LocalCar = CarLike
export type RawCarBackup = Partial<LocalCar>
export type LocalClient = ClientLike
export type RawClientBackup = Partial<LocalClient>
// 병합 전 조회가 못 찾았을 때의 `{}` 대체값이라 id까지 optional(DriverRecord 그대로면 프로퍼티 접근마다 타입 오류).
// driverName은 레거시 로컬 값 폴백 읽기용으로만 허용한다(DRIVER_KEYS엔 없다 — 정규화 결과에는 쓰지 않는다).
export type LocalDriver = Partial<DriverRecord> & { driverName?: string }

export type VehicleRow = { id: string | number, raw?: RawCarBackup | null, number?: string, type?: string, tonnage?: string, driver_name?: string, driver_pay_mode?: string | null, driver_salary_amount?: number | string | null, comm_enabled?: boolean, comm_type?: string | null, comm_value?: string | number }

export type ClientRow = { id: string | number, raw?: RawClientBackup | null, company_name?: string, legacy_client_id?: string, is_pinned?: boolean }

export type DriverLinkRow = { id: string | number, invite_code?: string, vehicle_id?: string | number, assignment_start?: string, assignment_end?: string, status?: string, unlink_requested_by?: string | null, unlink_requested_at?: string | null }

export type DailyLogRow = { work_date: string, raw?: JsonRecord | null, is_off?: boolean, fixed_count?: number }
export type DetailRow = { work_date: string, raw?: JsonRecord | null }
export type MergedDayRecord = { isOff: boolean, fixedCount: number, callDetails: Array<JsonRecord>, fuelItems?: Array<JsonRecord>, maintItems?: Array<JsonRecord>, miscItems?: Array<JsonRecord>, assignedVehicleNumber?: string }
