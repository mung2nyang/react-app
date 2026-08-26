// Step 4 도메인 폴더 이동: 순수 계산은 domain/clients.js로 옮겼다. 이 파일은 localStorage
// I/O(loadClients/saveClients)만 남기고, 기존 임포트 경로('../lib/clients.js')를 유지하는
// 배럴로 domain/clients.js를 재수출한다.
import { readJsonKey } from '../store/persist.js'
import { commitClients } from '../store/commitHelpers.js'

export function loadClients(ownerKey = 'guest') {
  const parsed = readJsonKey('clients', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveClients(ownerKey, clients) {
  commitClients(ownerKey, clients)
}

export * from '../domain/clients.js'
