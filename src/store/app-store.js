// Step 1~4 스토어 껍데기 + Step 0-4 감사 보완(1차/2차, 사용자 지시).
// UI는 아직 workLogs/cars/... 도메인 슬라이스를 구독하지 않는다 (migration-plan.md 1.3의
// "쓰지 말 것" 대상은 여전히 페이지 useState). 이 파일의 목적은 src/lib/*.js 의 save*
// 함수들이 "localStorage 기록 + 클라우드 동기화 예약"을 각자 반복하던 것을 하나의
// commit* 경로로 모으는 것과, hydration(클라우드 데이터 로딩) 진행 상태를 컴포넌트가
// 구독할 수 있는 곳에 두는 것이다.
//
// 서브 차량 workLogs는 아직 다루지 않는다 — 항상 'main' 한 칸.
// initializeOwnerFromPersist/replaceOwnerState는 owner-state.js로 분리했다(200줄 제한).

import { writeAllOrNothing } from './atomicPersist.js'
import { scheduleCloudSync } from '../lib/cloudSync.js'
import { markDirty } from '../lib/dirtyJournal.js'

/**
 * @typedef {'idle'|'hydrating'|'ready'|'failed'} HydrationStatus
 * idle: 부트 전/게스트 — 기다릴 hydrate가 없다. hydrating: Supabase 조회 중(UI 잠금).
 * ready: hydrate 성공 — 원격 쓰기 가능. failed: hydrate 실패 — UI는 잠금 해제(로컬 편집
 * 계속 가능)하되, 명시적 retry가 다시 ready가 되기 전까지 원격 쓰기는 계속 금지한다.
 */

/**
 * @typedef {Object} HydrationState
 * @property {HydrationStatus} status
 * @property {string|null} userId
 * @property {string|null} ownerKey
 */

/**
 * @typedef {Object} AppStoreState
 * @property {HydrationState} hydration
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
  hydration: { status: 'idle', userId: null, ownerKey: null },
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

// persist 키(domain)와 state 슬라이스 이름이 항상 같지는 않다 — workData만 workLogs에
// { main: value } 모양으로 들어간다. 이 사실을 아는 곳을 여기 한 곳으로 좁혀서,
// domain 문자열을 그대로 state 프로퍼티 이름으로 오인하는 사고(예: 존재하지 않는
// state.workData가 생기는 것)를 막는다.
function applyDomainToState(domain, ownerKey, value) {
  if (domain === 'workData') {
    state.workLogs = { ...state.workLogs, [ownerKey]: { main: value } }
    return
  }
  state[domain] = { ...state[domain], [ownerKey]: value }
}

/**
 * @typedef {Object} BatchEntry
 * @property {import('./persist.js').PersistDomain} domain
 * @property {string} ownerKey
 * @property {*} value
 */

/**
 * 여러 도메인을 한 번에, 중간 notify 없이 반영한다. 구독자는 모든 슬라이스가 반영된
 * "완성된" state를 정확히 한 번만 받는다 — commit()을 도메인 수만큼 반복 호출하면
 * notify도 그만큼 여러 번 나가서 구독자가 중간(불완전한) 상태를 볼 수 있었다.
 * `persist:false`는 owner-state.js의 initializeOwnerFromPersist처럼 "이미 persist에
 * 있는 값을 state로 옮겨 담기만" 할 때 쓴다(다시 쓸 필요 없음). `syncToCloud:false`는
 * hydrate 결과 반영처럼 "방금 서버에서 받은 걸 다시 서버로 되쏘지 않아야" 할 때 쓴다 —
 * 이때는 dirty journal에도 안 남긴다(서버와 이미 같은 값이라 보낼 게 없다).
 *
 * persist 단계는 atomicPersist.js의 writeAllOrNothing을 거친다 — localStorage 쓰기
 * 도중(용량 초과 등) 하나라도 실패하면 이미 쓴 항목까지 원래 값으로 되돌리고 던진다.
 * 이 예외가 여기서 위로 전파되면 state 반영(applyDomainToState)/notify는 아예
 * 실행되지 않으므로, "persist 일부만 성공 + state는 갱신 안 됨" 같은 불일치가 없다.
 * @param {Array<BatchEntry>} entries
 * @param {{ persist?: boolean, syncToCloud?: boolean }} [options]
 * @returns {Array<*>}
 */
export function commitBatch(entries, options = {}) {
  const { persist = true, syncToCloud = true } = options
  if (persist) writeAllOrNothing(entries)
  entries.forEach(({ domain, ownerKey, value }) => {
    applyDomainToState(domain, ownerKey, value)
    if (syncToCloud) markDirty(ownerKey, domain)
  })
  notify()
  if (syncToCloud && entries.length) scheduleCloudSync()
  return entries.map((entry) => entry.value)
}

/**
 * @template T
 * @param {import('./persist.js').PersistDomain} domain
 * @param {string} ownerKey
 * @param {T} value
 * @param {{ syncToCloud?: boolean }} [options]
 * @returns {T}
 */
function commit(domain, ownerKey, value, options = {}) {
  const [result] = commitBatch([{ domain, ownerKey, value }], options)
  return result
}

/** @param {string} ownerKey @param {object} data 날짜별 운행 기록 @param {{ syncToCloud?: boolean }} [options] */
export function commitWorkData(ownerKey, data, options = {}) {
  return commit('workData', ownerKey, data, options)
}

/** @param {string} ownerKey @param {Array<object>} cars @param {{ syncToCloud?: boolean }} [options] */
export function commitCars(ownerKey, cars, options = {}) {
  return commit('cars', ownerKey, cars, options)
}

/** @param {string} ownerKey @param {Array<object>} clients @param {{ syncToCloud?: boolean }} [options] */
export function commitClients(ownerKey, clients, options = {}) {
  return commit('clients', ownerKey, clients, options)
}

/** @param {string} ownerKey @param {object} settings 이미 normalizeSettings를 거친 값 @param {{ syncToCloud?: boolean }} [options] */
export function commitSettings(ownerKey, settings, options = {}) {
  return commit('settings', ownerKey, settings, options)
}

/** @param {string} ownerKey @param {Array<object>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitExpenses(ownerKey, items, options = {}) {
  return commit('expenses', ownerKey, items, options)
}

/** @param {string} ownerKey @param {Array<object>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitInvoices(ownerKey, items, options = {}) {
  return commit('invoices', ownerKey, items, options)
}

/** @param {string} ownerKey @param {Array<object>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitDrivers(ownerKey, items, options = {}) {
  return commit('drivers', ownerKey, items, options)
}

/** @param {string} ownerKey @param {object} profile 이미 emptyProfile과 병합된 값 @param {{ syncToCloud?: boolean }} [options] */
export function commitProfile(ownerKey, profile, options = {}) {
  return commit('profile', ownerKey, profile, options)
}

/**
 * 무시한 알림 id 목록. 바닐라/클라우드 계약(KEYS)에 없는 로컬 전용 값이라
 * 클라우드 동기화는 예약하지 않는다(기존 dismissNotification과 동일한 동작이라
 * syncToCloud 오버라이드를 허용하지 않는다).
 * @param {string} ownerKey
 * @param {Array<string>} ids
 * @returns {Array<string>}
 */
export function commitDismissedNotifications(ownerKey, ids) {
  return commit('dismissedNotifications', ownerKey, ids, { syncToCloud: false })
}

/**
 * cloudSync.js의 hydrateFromSupabase/endCloudSession이 부르는 단일 경로.
 * localStorage에는 쓰지 않는다 — hydration은 진행 상태일 뿐 저장 대상이 아니다.
 * @param {Partial<HydrationState>} patch
 */
export function setHydration(patch) {
  state.hydration = { ...state.hydration, ...patch }
  notify()
}
