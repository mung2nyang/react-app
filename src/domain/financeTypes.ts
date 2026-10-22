// finance*.ts가 함께 쓰는 매개변수 모양 모음(타입 전용 모듈). `link = null` 같은 기본값만 있으면
// TS가 null만 되는 타입으로 좁히므로 여기서 모양을 밝혀 둔다.
import type { DayRecordLike } from './day-record.ts'
import type { ClientLike } from './clients.ts'

/** logId(차량번호|'main') → 날짜 → 기록 */
export type WorkDataByLogId = Record<string, Record<string, DayRecordLike>>

export type CarLike = {
  id?: string
  supabaseId?: string | number
  number: string
  tonnage?: string
  type?: 'main' | 'sub'
  commEnabled?: boolean
  commType?: string
  commission?: string | number
  insuranceOn?: boolean // 산재보험료 기사 몫(50%) 차감 여부(driverIncomeDeductions.ts)
  driverIncomeType?: 'employee' | 'business' // 기사 유형: 4대보험 근로자 / 3.3% 사업소득자
  withholdingOn?: boolean // 3.3% 사업소득세 원천징수 여부
  expenseRate?: string | number // 산재 월보수액 계산용 필요경비율(%)
  insuranceRate?: string | number // 산재보험료율(%), 0이면 산재 적용 제외
  driverShareBase?: 'gross' | 'afterClientCommission' // 매출제 기사 몫 기준 — 운송료 전체(기본)/거래처 수수료 뗀 뒤(로드맵 61)
  logEnabled?: boolean
  driverLinkEnabled?: boolean
  shareRevenueWithOwner?: boolean
  archived?: boolean
  driverName?: string
  driverPhone?: string
  driverLinkId?: string
  driverPayMode?: string
  driverSalaryAmount?: string | number
  infoType?: string
  personalInfo?: { driverName?: string, bizNumber?: string, name?: string, address?: string, bizType?: string, bizItem?: string, email?: string, phone?: string, bank?: string, account?: string, accountHolder?: string }
  businessInfo?: { sameAsOwner?: boolean, name?: string, bizNumber?: string, representative?: string, address?: string, bizType?: string, bizItem?: string, email?: string }
}

export type DriverLinkLike = {
  id?: string
  vehicleNumber?: string
  assignmentStart?: string
  assignmentEnd?: string
  status?: string
}

export type SupplierBiz = {
  sameAsOwner?: boolean
  name?: string
  bizNumber?: string
  representative?: string
  address?: string
  bizType?: string
  bizItem?: string
  email?: string
}

/**
 * finance*.ts 함수들이 공유하는 설정 모양 — data/sync/ownerFinance.js의 buildFinanceSettings가
 * 실제로 만드는 값의 상위집합(느슨하게, 전부 optional로 — 픽스처/실제 값 둘 다
 * 이 함수들에 그대로 들어온다).
 */
export type FinanceSettings = {
  cars?: Array<CarLike>
  clients?: Array<ClientLike>
  driverLinks?: Array<DriverLinkLike>
  paymentOn?: boolean
  subPaymentOn?: boolean
  fixedOn?: boolean
  subFixedOn?: boolean
  unitPrice?: number | string
  bizName?: string
  bizNumber?: string
  bizRepresentative?: string
  userName?: string
  bizAddress?: string
  bizType?: string
  bizItem?: string
  bizEmail?: string
  theme?: 'light' | 'dark'
  inputMode?: 'count' | 'fare'
  callDetail?: boolean
  timeOn?: boolean
  platformOn?: boolean
  distanceOn?: boolean
  cargoTonnageOn?: boolean
  dailyInspectionOn?: boolean // 일상점검표 사용(메인 차량 — 기사차량은 subCarSettings)
  notifOff?: Array<string> // 알림 화면에서 끈 알림 종류(NOTIF_KINDS)
  fixedRouteOn?: boolean
  fixedRoutePresets?: Array<{ id: string, loadLoc: string, unloadLoc: string }>
  runCountToggle?: boolean
  runCountPresets?: Array<number>
  subFixedRouteOn?: boolean
  subFixedRoutePresets?: Array<{ id: string, loadLoc: string, unloadLoc: string }>
  subRunCountToggle?: boolean
  subRunCountPresets?: Array<number>
  pinnedLocations?: Array<string>
  subCarSettings?: Record<string, SubCarPracticeSettings> // 서브차량 번호별 전용 값(세부입력 5종+달력 표시방식만, 결제/고정노선은 공용)
}

export type SubCarPracticeSettings = {
  inputMode: 'count' | 'fare'
  callDetail: boolean
  timeOn: boolean
  platformOn: boolean
  distanceOn: boolean
  cargoTonnageOn: boolean
  dailyInspectionOn?: boolean // 일상점검표 사용(9-B-1)
}
