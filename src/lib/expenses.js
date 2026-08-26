// Step 4 도메인 폴더 이동: 순수 계산은 domain/expenses.js로 옮겼다. 이 파일은 localStorage
// I/O(loadExpenses/saveExpenses)만 남기고, 기존 임포트 경로('../lib/expenses.js')를 유지하는
// 배럴로 domain/expenses.js를 재수출한다.
import { readJsonKey } from '../store/persist.js'
import { commitExpenses } from '../store/commitHelpers.js'

export function loadExpenses(ownerKey = 'guest') {
  const parsed = readJsonKey('expenses', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveExpenses(ownerKey, items) {
  commitExpenses(ownerKey, items)
}

export * from '../domain/expenses.js'
