// Step 5(달력 홈 재작성) 재감사 3차: typedWorkLogPage.js 옆에 두는 타입 선언 파일.
// WorkLogPage.jsx는 여전히 손대지 않는다 — 이 파일은 그 컴포넌트를 MainPageRoute.jsx가
// 어떤 계약(WorkLogPageProps)으로 쓸지만 선언한다. clients/settings 필드는 실제로
// 그 값을 만드는 함수(loadClients/normalizeSettings)의 반환 타입에서 파생한다 —
// 별도로 지어낸 타입이 그 함수들과 어긋날 위험이 없다.
import type { ReactElement } from 'react'
import type { normalizeSettings } from '../domain/practiceSettings.js'
import type { loadClients } from '../lib/clients.js'

type DayRecordLike = import('../domain/calendarBadges.js').DayRecordLike
type CallDetailLike = import('../domain/calendarBadges.js').CallDetailLike

export interface WorkLogPageProps {
  month: number
  day: number
  dateKey: string
  count: number
  isOff: boolean
  record?: DayRecordLike
  clients?: ReturnType<typeof loadClients>
  ownerKey?: string
  settings?: ReturnType<typeof normalizeSettings>
  onCountChange: (count: number) => void
  onOffChange: (off: boolean) => void
  onCallDetailsChange: (callDetails: CallDetailLike[]) => void
  onRouteCountsChange: (fixedRouteCounts: Record<string, number>, fixedCount: number) => void
  onClose: () => void
  showToast?: (message: string) => void
}

export declare function TypedWorkLogPage(props: WorkLogPageProps): ReactElement
