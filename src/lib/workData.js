// 운행 기록(workData) 저장소 I/O. 파생 계산·콜상세·결제 원장은 200줄 제한 때문에
// day-record.js / call-details.js / payments.js로 분리했고, 이 파일이 기존 임포트
// 경로('../lib/workData.js')를 그대로 유지하는 배럴이다 — 호출부는 한 곳도 바꿀 필요 없다.
import { readJsonKey } from '../store/persist.js'
import { commitWorkData } from '../store/app-store.js'

export function loadWorkData(ownerKey = 'guest') {
  const parsed = readJsonKey('workData', ownerKey, {})
  return parsed && typeof parsed === 'object' ? parsed : {}
}

export function saveWorkData(ownerKey, data) {
  commitWorkData(ownerKey, data)
}

export * from './day-record.js'
export * from './call-details.js'
export * from './payments.js'
