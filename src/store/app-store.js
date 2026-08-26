// Step 1 스토어 껍데기: UI는 아직 이 스토어를 구독하지 않는다 (migration-plan.md 1.3의
// "쓰지 말 것" 대상은 여전히 페이지 useState). 이 파일의 목적은 src/lib/*.js 의 save*
// 함수들이 "localStorage 기록 + 클라우드 동기화 예약"을 각자 반복하던 것을 하나의
// commit* 경로로 모으는 것뿐이다 (migration-audit-plan.md Step 1).
//
// 다음 Step(부트/플러시/hydration lock, 라우터)부터 컴포넌트가 getState/subscribe를
// 직접 구독하도록 확장한다. 서브 차량 workLogs는 아직 다루지 않는다 — 항상 'main' 한 칸.

import { writeJsonKey } from './persist.js'
import { scheduleCloudSync } from '../lib/cloudSync.js'

/**
 * @typedef {Object} AppStoreState
 * @property {Record<string, Record<string, object>>} workLogs          ownerKey -> { main: object }
 * @property {Record<string, Array<object>>} cars                       ownerKey -> Car[]
 * @property {Record<string, Array<object>>} clients                    ownerKey -> Client[]
 * @property {Record<string, object>} settings                          ownerKey -> Settings
 * @property {Record<string, Array<object>>} expenses                   ownerKey -> Expense[]
 * @property {Record<string, Array<object>>} invoices                   ownerKey -> Invoice[]
 * @property {Record<string, Array<object>>} drivers                    ownerKey -> Driver[]
 * @property {Record<string, object>} profile                           ownerKey -> Profile
 * @property {Record<string, Array<string>>} dismissedNotifications     ownerKey -> id[]
 */

/** @type {AppStoreState} */
const state = {
  workLogs: {},
  cars: {},
  clients: {},
  settings: {},
  expenses: {},
  invoices: {},
  drivers: {},
  profile: {},
  dismissedNotifications: {},
}

/** @type {Set<(state: AppStoreState) => void>} */
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => listener(state))
}

/**
 * @param {(state: AppStoreState) => void} listener
 * @returns {() => void} 구독 해제 함수
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** @returns {AppStoreState} */
export function getState() {
  return state
}

/**
 * 도메인 슬라이스 하나를 localStorage에 쓰고, 메모리 상태를 갱신하고, 필요하면
 * 클라우드 동기화를 예약하는 단일 경로. 모든 commit* 함수가 이 함수를 거친다.
 * @template T
 * @param {import('./persist.js').PersistDomain} domain
 * @param {string} ownerKey
 * @param {T} value
 * @param {{ syncToCloud?: boolean }} [options]
 * @returns {T}
 */
function commit(domain, ownerKey, value, options = {}) {
  const { syncToCloud = true } = options
  writeJsonKey(domain, ownerKey, value)
  state[domain] = { ...state[domain], [ownerKey]: value }
  notify()
  if (syncToCloud) scheduleCloudSync()
  return value
}

/**
 * @param {string} ownerKey
 * @param {object} data 날짜별 운행 기록 (loadWorkData/saveDayRecord 결과와 같은 형태)
 * @returns {object}
 */
export function commitWorkData(ownerKey, data) {
  state.workLogs = { ...state.workLogs, [ownerKey]: { main: data } }
  return commit('workData', ownerKey, data)
}

/**
 * @param {string} ownerKey
 * @param {Array<object>} cars
 * @returns {Array<object>}
 */
export function commitCars(ownerKey, cars) {
  return commit('cars', ownerKey, cars)
}

/**
 * @param {string} ownerKey
 * @param {Array<object>} clients
 * @returns {Array<object>}
 */
export function commitClients(ownerKey, clients) {
  return commit('clients', ownerKey, clients)
}

/**
 * @param {string} ownerKey
 * @param {object} settings 이미 normalizeSettings를 거친 값
 * @returns {object}
 */
export function commitSettings(ownerKey, settings) {
  return commit('settings', ownerKey, settings)
}

/**
 * @param {string} ownerKey
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function commitExpenses(ownerKey, items) {
  return commit('expenses', ownerKey, items)
}

/**
 * @param {string} ownerKey
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function commitInvoices(ownerKey, items) {
  return commit('invoices', ownerKey, items)
}

/**
 * @param {string} ownerKey
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function commitDrivers(ownerKey, items) {
  return commit('drivers', ownerKey, items)
}

/**
 * @param {string} ownerKey
 * @param {object} profile 이미 emptyProfile과 병합된 값
 * @returns {object}
 */
export function commitProfile(ownerKey, profile) {
  return commit('profile', ownerKey, profile)
}

/**
 * 무시한 알림 id 목록. 바닐라/클라우드 계약(KEYS)에 없는 로컬 전용 값이라
 * 클라우드 동기화는 예약하지 않는다 (기존 dismissNotification과 동일한 동작).
 * @param {string} ownerKey
 * @param {Array<string>} ids
 * @returns {Array<string>}
 */
export function commitDismissedNotifications(ownerKey, ids) {
  return commit('dismissedNotifications', ownerKey, ids, { syncToCloud: false })
}
