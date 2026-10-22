// 기사 레코드 타입 정본(타입 전용 모듈).

/** 기사 레코드. */
export type DriverRecord = {
  id: string
  name?: string
  phone?: string
  vehicleNumber?: string
  startDate?: string
  endDate?: string
  inviteCode?: string
  status?: 'pending' | 'linked'
  supabaseId?: number | string
  /** 연동 해제를 요청한 사람 id(차주 또는 기사) */
  unlinkRequestedBy?: string
  /** 해제 요청 시각(ISO) — 3일 지나면 자동 해제 */
  unlinkRequestedAt?: string
}
