// Step 4 도메인 폴더 이동: 순수 계산은 domain/drivers.js로 옮겼다. 이 파일은 localStorage
// I/O(loadDrivers/saveDrivers)만 남기고, 기존 임포트 경로('../lib/drivers.js')를 유지하는
// 배럴로 domain/drivers.js를 재수출한다.
import { readJsonKey } from '../store/persist.js'
import { commitDrivers } from '../store/app-store.js'

export function loadDrivers(ownerKey = 'guest') {
  const parsed = readJsonKey('drivers', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveDrivers(ownerKey, items) {
  commitDrivers(ownerKey, items)
}

export * from '../domain/drivers.js'
