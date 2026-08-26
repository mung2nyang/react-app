// 운행 기록(workData) 저장소 I/O. 파생 계산·콜상세·결제 원장은 Step 1에서 200줄 제한
// 때문에 day-record.js / call-details.js / payments.js로 분리했고, Step 4에서 그 셋을
// 전부 domain/으로 옮겼다. 이 파일은 기존 임포트 경로('../lib/workData.js')를 그대로
// 유지하는 배럴이다 — 호출부는 한 곳도 바꿀 필요 없다.
import { readJsonKey } from '../store/persist.js'
import { commitWorkData } from '../store/commitHelpers.js'

export function loadWorkData(ownerKey = 'guest') {
  const parsed = readJsonKey('workData', ownerKey, {})
  return parsed && typeof parsed === 'object' ? parsed : {}
}

export function saveWorkData(ownerKey, data) {
  commitWorkData(ownerKey, data)
}

export * from '../domain/day-record.js'
export * from '../domain/call-details.js'
export * from '../domain/payments.js'
