// 서버 직접 저장 파일들이 같이 쓰는 타입(타입 전용 모듈).
import type { DriverRecord } from '../../domain/driverTypes.ts'

export type OutboxResourceType = 'vehicle' | 'client' | 'driverLink'
export type OutboxKind = 'tombstone' | 'mutation'

/**
 * op.payload의 실제 사용 필드 전부 — resourceType/operation 조합마다 부분집합만
 * 채워진다(예: 차량 삭제 tombstone은 비워 두고, 기사 upsert는 대부분 채운다).
 */
export type OutboxPayload = {
  supabaseId?: number | string | null
  vehicleNumber?: string
  startDate?: string
  endDate?: string
  inviteCode?: string
  previousDriverSnapshot?: DriverRecord | null
  status?: 'pending' | 'linked'
}

export type OutboxOp = {
  id: string
  ownerKey: string
  userId: string
  resourceType: OutboxResourceType
  resourceId: string
  kind: OutboxKind
  operation: string
  payload: OutboxPayload
  sessionEpoch: number
  createdAt: string
}

export type SessionCapture = { userId: string | null, ownerKey: string | null, epoch: number }

/** `cars` 도메인 레코드 중 outbox 실행기가 실제로 읽는 필드만. */
export type CarRecord = {
  id: string
  number?: string
  type?: 'main' | 'sub'
  supabaseId?: number | string
}

/**
 * `driver_links` 테이블에서 upsert가 돌려주는 원본 행(supabase-js가 Database 제네릭
 * 없이 쓰이고 있어 실제 컬럼 타입을 여기서 명시한다).
 */
export type DriverLinkRow = {
  id: number | string
  owner_id?: string
  driver_id?: string | null
  vehicle_id?: string | null
  invite_code?: string
  assignment_start?: string | null
  assignment_end?: string | null
  status?: 'pending' | 'linked' | 'disconnected'
}

/**
 * App.jsx가 들고 있는 화면 단위 로그인 세션(cloudSession.ts의 저수준 epoch 세션과는
 * 다른 개념 — 이쪽은 UI가 보는 "누가 로그인했는지/게스트인지").
 */
export type AppSession = {
  userId?: string | null
  name?: string
  phone?: string
  accountType?: string
  linkedOwnerId?: string | null // 연동된 차주 id(employed_driver일 때 ownerKey로 씀)
  guestMode?: boolean
}
