// 일상점검표 저장·지우기 성공 알림(앱 안에서만, 보관 없음) — 열어 둔 화면이 다시 읽지 않고 맞추게.
export type DailyInspectionChange = { vehicleId: string | number, workDate: string, saved: boolean }

const listeners = new Set<(change: DailyInspectionChange) => void>()

export function notifyDailyInspectionChanged(change: DailyInspectionChange) {
  listeners.forEach((listener) => listener(change))
}

/** 저장·지우기가 성공하면 부른다. 돌려준 함수가 구독 해제. */
export function subscribeDailyInspectionChanges(listener: (change: DailyInspectionChange) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
