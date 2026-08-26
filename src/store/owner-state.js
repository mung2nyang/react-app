// Step 0-4 감사 보완: 앱 부트와 Supabase hydrate가 반드시 거쳐야 하는 두 관문.
// - initializeOwnerFromPersist: localStorage에 이미 있는 값으로 store를 "읽기만" 해서 채운다.
// - replaceOwnerState: 서버(hydrate)나 스냅샷 복원처럼 "새 진실"을 owner 전체에 한 번에
//   반영할 때 쓴다. sync:false를 기본으로 두지 않는 이유는 일반 쓰기 경로(초기화가 아닌
//   진짜 로컬 편집)에서도 이 함수를 재사용할 수 있게 열어 두기 위함이고, hydrate 쪽에서는
//   반드시 { sync: false }를 넘겨서 "방금 서버에서 받은 걸 다시 서버로 되쏘는" 핑퐁을 막는다.
import { readJsonKey } from './persist.js'
import {
  commitCars,
  commitClients,
  commitDrivers,
  commitExpenses,
  commitInvoices,
  commitProfile,
  commitSettings,
  commitWorkData,
  getState,
} from './app-store.js'

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * localStorage에 이미 저장된 값을 store에 읽어 들인다. 아무것도 새로 쓰지 않고,
 * 클라우드 동기화도 예약하지 않는다 — 순수 "state를 persist와 맞춘다"만 한다.
 * @param {string} ownerKey
 */
export function initializeOwnerFromPersist(ownerKey) {
  const state = getState()
  const workData = readJsonKey('workData', ownerKey, {})
  state.workLogs = { ...state.workLogs, [ownerKey]: { main: toObject(workData) } }
  state.cars = { ...state.cars, [ownerKey]: toArray(readJsonKey('cars', ownerKey, [])) }
  state.clients = { ...state.clients, [ownerKey]: toArray(readJsonKey('clients', ownerKey, [])) }
  state.settings = { ...state.settings, [ownerKey]: toObject(readJsonKey('settings', ownerKey, {})) }
  state.expenses = { ...state.expenses, [ownerKey]: toArray(readJsonKey('expenses', ownerKey, [])) }
  state.invoices = { ...state.invoices, [ownerKey]: toArray(readJsonKey('invoices', ownerKey, [])) }
  state.drivers = { ...state.drivers, [ownerKey]: toArray(readJsonKey('drivers', ownerKey, [])) }
  state.profile = { ...state.profile, [ownerKey]: toObject(readJsonKey('profile', ownerKey, {})) }
  state.dismissedNotifications = {
    ...state.dismissedNotifications,
    [ownerKey]: toArray(readJsonKey('dismissedNotifications', ownerKey, [])),
  }
}

/**
 * @typedef {Object} OwnerSnapshot
 * @property {object} [workData]
 * @property {Array<object>} [cars]
 * @property {Array<object>} [clients]
 * @property {Array<object>} [drivers]
 * @property {object} [profile]
 * @property {object} [settings]
 * @property {Array<object>} [expenses]
 * @property {Array<object>} [invoices]
 */

/**
 * owner 전체 슬라이스를 스냅샷으로 교체한다(cloudSync.js의 collectPracticeSnapshot과
 * 같은 모양). 각 필드는 있을 때만 반영 — 부분 스냅샷도 안전하다.
 * @param {string} ownerKey
 * @param {OwnerSnapshot} [snapshot]
 * @param {{ sync?: boolean }} [options]
 */
export function replaceOwnerState(ownerKey, snapshot = {}, options = {}) {
  const { sync = true } = options
  const commitOptions = { syncToCloud: sync }
  if (snapshot.workData && typeof snapshot.workData === 'object') {
    commitWorkData(ownerKey, snapshot.workData, commitOptions)
  }
  if (Array.isArray(snapshot.cars)) commitCars(ownerKey, snapshot.cars, commitOptions)
  if (Array.isArray(snapshot.clients)) commitClients(ownerKey, snapshot.clients, commitOptions)
  if (Array.isArray(snapshot.drivers)) commitDrivers(ownerKey, snapshot.drivers, commitOptions)
  if (snapshot.profile && typeof snapshot.profile === 'object') commitProfile(ownerKey, snapshot.profile, commitOptions)
  if (snapshot.settings && typeof snapshot.settings === 'object') commitSettings(ownerKey, snapshot.settings, commitOptions)
  if (Array.isArray(snapshot.expenses)) commitExpenses(ownerKey, snapshot.expenses, commitOptions)
  if (Array.isArray(snapshot.invoices)) commitInvoices(ownerKey, snapshot.invoices, commitOptions)
}
