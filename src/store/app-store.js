// @ts-check
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
import { buildBatchWrites } from './batchWrites.js'
import { scheduleCloudSync } from '../lib/syncQueue.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../lib/hydrateMergeTypes.js').LocalProfile} ProfileLike */

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
 * @property {Record<string, { main?: Record<string, DayRecordLike> }>} workLogs ownerKey -> { main: 날짜별 기록 }
 * @property {Record<string, Array<CarLike>>} cars                      ownerKey -> Car[]
 * @property {Record<string, Array<ClientLike>>} clients                ownerKey -> Client[]
 * @property {Record<string, FinanceSettings>} settings                 ownerKey -> Settings
 * @property {Record<string, Array<ExpenseItem>>} expenses              ownerKey -> Expense[]
 * @property {Record<string, Array<InvoiceLike>>} invoices              ownerKey -> Invoice[]
 * @property {Record<string, Array<DriverRecord>>} drivers               ownerKey -> Driver[]
 * @property {Record<string, ProfileLike>} profile                      ownerKey -> Profile
 * @property {Record<string, Array<string>>} dismissedNotifications     ownerKey -> id[]
 * @property {Record<string, import('../domain/workDataTombstones.js').WorkDataTombstones>} workDataDeletedDates ownerKey -> {dateKey: 삭제시각}
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
  workDataDeletedDates: {},
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
 * 재감사 10차(FAIL 지적 4번) — 9+1개 persist 도메인이 실제로 갖는 값 모양 전부를
 * 실제 도메인 타입의 합집합으로 적는다(예전엔 object/Array<object>로 뭉뚱그렸다).
 * applyDomainToState의 동적 키 대입(stateAsRecord[slice] = ...)은 TS가 합집합
 * 프로퍼티에 값을 쓸 때 요구하는 "값이 합집합 전체와 호환돼야" 하는 제약을 그대로
 * 만족한다 — 각 domain이 실제로 이 합집합의 한 갈래이기만 하면 되고, 어떤 갈래인지는
 * buildBatchWrites 호출부(commitHelpers.js)가 이미 domain별로 정확한 타입의 값만
 * 넘기도록 보장한다.
 * @typedef {Record<string, DayRecordLike>|FinanceSettings|ProfileLike|
 *   import('../domain/workDataTombstones.js').WorkDataTombstones|Array<CarLike>|
 *   Array<ClientLike>|Array<DriverRecord>|Array<ExpenseItem>|Array<InvoiceLike>|
 *   Array<string>} DomainValue
 */

// persist 키(domain)와 state 슬라이스 이름이 항상 같지는 않다 — workData만 workLogs에
// { main: value } 모양으로 들어간다. 이 사실을 아는 곳을 여기 한 곳으로 좁혀서,
// domain 문자열을 그대로 state 프로퍼티 이름으로 오인하는 사고(예: 존재하지 않는
// state.workData가 생기는 것)를 막는다.
/**
 * @param {import('./persist.js').PersistDomain} domain
 * @param {string} ownerKey
 * @param {DomainValue} value
 */
function applyDomainToState(domain, ownerKey, value) {
  if (domain === 'workData') {
    // 'workData' domain의 값은 항상 Record<string, DayRecordLike>다(commitHelpers.js의
    // commitWorkData가 그 모양만 넘긴다) — DomainValue 합집합 중 이 갈래로 좁힌다.
    const workData = /** @type {Record<string, DayRecordLike>} */ (value)
    state.workLogs = { ...state.workLogs, [ownerKey]: { main: workData } }
    return
  }
  // 위 분기가 'workData'를 이미 처리하고 리턴했으니, 여기 도달하는 domain은 항상
  // AppStoreState의 실제 슬라이스 이름과 정확히 같은 나머지 9개 중 하나다. 동적
  // 키(slice)로 쓰는 자리는 TS가 "이 값이 9개 슬라이스 타입 전부(교집합)에 맞는지"를
  // 구조적으로 요구해서(실측 — 합집합 읽기/교집합 쓰기라는 TS의 알려진 제약) 어느
  // 구체 타입을 넣어도 못 좁힌다. state 자신을 "ownerKey -> DomainValue" 레코드로
  // 단언한다 — 9개 슬라이스 전부가 실제로 그 구조를 그대로 만족하므로(각 슬라이스가
  // Record<string, DomainValue> 그 자체다) any/unknown을 경유하지 않는 정확한 타입이다.
  const slice = /** @type {Exclude<import('./persist.js').PersistDomain, 'workData'>} */ (domain)
  const stateAsRecord = /** @type {Record<Exclude<import('./persist.js').PersistDomain, 'workData'>, Record<string, DomainValue>>} */ (state)
  stateAsRecord[slice] = { ...stateAsRecord[slice], [ownerKey]: value }
}

/**
 * @typedef {Object} BatchEntry
 * @property {import('./persist.js').PersistDomain} domain
 * @property {string} ownerKey
 * @property {DomainValue} value
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
 * 감사 보완 3차: 도메인 값 쓰기와 dirty journal 쓰기를 batchWrites.js가 "하나의" 쓰기
 * 목록으로 미리 계산해 주고, 여기서는 그 목록을 writeAllOrNothing 한 번으로 쓴다.
 * 예전엔 markDirty()가 도메인 값을 다 쓴 *뒤에* 자기 localStorage.setItem을 또 불러서,
 * 그 호출만 실패해도(용량 초과 등) "도메인은 새 값인데 journal은 갱신 안 됨" 같은
 * 불일치가 생길 수 있었다. 이제 이 전체 쓰기(도메인 + journal)가 하나라도 실패하면
 * writeAllOrNothing이 이미 쓴 것까지 전부 되돌리고 던지므로, state 반영
 * (applyDomainToState)/notify는 그 경우 아예 실행되지 않는다.
 * @param {Array<BatchEntry>} entries
 * @param {{ persist?: boolean, syncToCloud?: boolean }} [options]
 * @returns {Array<DomainValue>}
 */
export function commitBatch(entries, options = {}) {
  const { persist = true, syncToCloud = true } = options

  const writes = buildBatchWrites(entries, { persist, syncToCloud })
  if (writes.length) writeAllOrNothing(writes)

  entries.forEach(({ domain, ownerKey, value }) => {
    applyDomainToState(domain, ownerKey, value)
  })
  notify()
  if (syncToCloud && entries.length) scheduleCloudSync()
  return entries.map((entry) => entry.value)
}

// commitWorkData/commitCars/.../commitDismissedNotifications — 도메인별 commitBatch
// 얇은 래퍼들은 commitHelpers.js로 옮겼다(200줄 제한). commitHelpers.js가 이 파일의
// commitBatch를 가져다 쓰므로, 여기서 다시 배럴로 재수출하면 순환 참조가 생긴다 —
// 대신 그 함수들을 쓰던 lib/*.js 9곳의 import 경로를 commitHelpers.js로 직접 옮겼다.

/**
 * cloudSync.js의 hydrateFromSupabase/endCloudSession이 부르는 단일 경로.
 * localStorage에는 쓰지 않는다 — hydration은 진행 상태일 뿐 저장 대상이 아니다.
 * @param {Partial<HydrationState>} patch
 */
export function setHydration(patch) {
  state.hydration = { ...state.hydration, ...patch }
  notify()
}
