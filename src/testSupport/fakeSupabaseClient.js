// Step 0-4 감사 보완 4차: hydrate/outbox/syncQueue 테스트가 공유하는 가짜 supabase
// 클라이언트. mock.module()로 실제 supabaseClient.js를 바꿔치기하는 각 테스트 파일이
// 이 팩토리로 handlers/callCounts를 매번 새로 만든다(파일 간 상태 공유 없음 — 테스트
// 독립성).

/** @typedef {Record<string, string|number>} EqFilters */
/** @typedef {{ data?: import('../store/atomicPersist.js').JsonValue, error?: { message?: string } | null }} FakeQueryResult */
/** @typedef {(arg?: EqFilters | import('../store/atomicPersist.js').JsonValue) => FakeQueryResult | Promise<FakeQueryResult>} FakeHandler */
/** @typedef {Record<string, Record<string, FakeHandler>>} FakeHandlers */

/**
 * @param {(filters: EqFilters) => FakeQueryResult | Promise<FakeQueryResult>} getResult
 */
export function chainable(getResult) {
  /** @type {EqFilters} */
  const filters = {}
  const api = {
    select: () => api,
    /** @param {string} column @param {string|number} value */
    eq: (column, value) => { filters[column] = value; return api },
    neq: () => api,
    in: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: () => api,
    single: () => api,
    /**
     * @param {(value: FakeQueryResult) => FakeQueryResult} [onFulfilled]
     * @param {(reason: Error) => FakeQueryResult} [onRejected]
     */
    then: (onFulfilled, onRejected) => Promise.resolve().then(() => getResult(filters)).then(onFulfilled, onRejected),
    /** @param {(reason: Error) => FakeQueryResult} [onRejected] */
    catch: (onRejected) => Promise.resolve().then(() => getResult(filters)).catch(onRejected),
  }
  return api
}

/** @returns {{ fakeSupabase: { from: (table: string) => ReturnType<typeof chainable>, auth: { signOut: () => Promise<{ error: null }> } }, handlers: FakeHandlers, callCounts: Record<string, number>, resetHandlers: () => void, countOf: (table: string, method: string) => number, emptyOkHandlers: () => FakeHandlers }} */
export function createFakeSupabase() {
  /** @type {FakeHandlers} */
  const handlers = {}
  /** @type {Record<string, number>} */
  const callCounts = {}

  function resetHandlers() {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    Object.keys(callCounts).forEach((key) => delete callCounts[key])
  }

  /** @param {string} table @param {string} method */
  function bump(table, method) {
    const key = `${table}.${method}`
    callCounts[key] = (callCounts[key] || 0) + 1
  }

  /** @param {string} table @param {string} method */
  function countOf(table, method) {
    return callCounts[`${table}.${method}`] || 0
  }

  function emptyOkHandlers() {
    return {
      profiles: { select: () => ({ data: null, error: null }) },
      vehicles: { select: () => ({ data: [], error: null }) },
      clients: { select: () => ({ data: [], error: null }) },
      driver_links: { select: () => ({ data: [], error: null }) },
      tax_invoices: { select: () => ({ data: [], error: null }) },
    }
  }

  const fakeSupabase = {
    /** @param {string} table */
    from(table) {
      const h = handlers[table] || {}
      return {
        select: () => { bump(table, 'select'); return chainable(h.select || (() => ({ data: [], error: null }))) },
        /** @param {import('../store/atomicPersist.js').JsonValue} row */
        upsert: (row) => { bump(table, 'upsert'); return chainable(() => (h.upsert ? h.upsert(row) : { data: null, error: null })) },
        /** @param {import('../store/atomicPersist.js').JsonValue} row */
        insert: (row) => { bump(table, 'insert'); return chainable(() => (h.insert ? h.insert(row) : { data: null, error: null })) },
        /** @param {import('../store/atomicPersist.js').JsonValue} row */
        update: (row) => { bump(table, 'update'); return chainable(() => (h.update ? h.update(row) : { data: null, error: null })) },
        delete: () => { bump(table, 'delete'); return chainable(h.delete || (() => ({ data: null, error: null }))) },
      }
    },
    auth: { signOut: async () => ({ error: null }) },
  }

  return { fakeSupabase, handlers, callCounts, resetHandlers, countOf, emptyOkHandlers }
}

/** @param {number} ms */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
