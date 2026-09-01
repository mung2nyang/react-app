// Step 0-4 감사 보완 4차: hydrate/outbox/syncQueue 테스트가 공유하는 가짜 supabase
// 클라이언트. mock.module()로 실제 supabaseClient.js를 바꿔치기하는 각 테스트 파일이
// 이 팩토리로 handlers/callCounts를 매번 새로 만든다(파일 간 상태 공유 없음 — 테스트
// 독립성).

/** @typedef {Record<string, string|number>} EqFilters */
/** @typedef {{ data?: import('../store/atomicPersist.js').JsonValue, error?: { message?: string } | null }} FakeQueryResult */
/** @typedef {(arg?: EqFilters | import('../store/atomicPersist.js').JsonValue) => FakeQueryResult | Promise<FakeQueryResult>} FakeHandler */
/** @typedef {Record<string, Record<string, FakeHandler>>} FakeHandlers */
/** @typedef {(args?: import('../store/atomicPersist.js').JsonValue) => FakeQueryResult | Promise<FakeQueryResult>} FakeRpcHandler */

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

/** @returns {{ fakeSupabase: { from: (table: string) => ReturnType<typeof chainable>, rpc: (fn: string, args?: import('../store/atomicPersist.js').JsonValue) => Promise<FakeQueryResult>, auth: { signOut: () => Promise<{ error: null }> } }, handlers: FakeHandlers, callCounts: Record<string, number>, resetHandlers: () => void, countOf: (table: string, method: string) => number, emptyOkHandlers: () => FakeHandlers }} */
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
    /**
     * 슬라이스 A: upsert_driver_link_idempotent 등 RPC. handlers.rpc[fnName]가 있으면
     * 그걸 부르고, 없으면 no-op { data: null, error: null }. countOf('rpc', fnName)로 카운트.
     * @param {string} fnName @param {import('../store/atomicPersist.js').JsonValue} [args]
     */
    rpc(fnName, args) {
      bump('rpc', fnName)
      const h = (handlers.rpc || {})[fnName]
      return Promise.resolve().then(() => (h ? h(args) : { data: null, error: null }))
    },
    auth: { signOut: async () => ({ error: null }) },
  }

  return { fakeSupabase, handlers, callCounts, resetHandlers, countOf, emptyOkHandlers }
}

/** @param {number} ms */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 슬라이스 C: hydrate가 "빈 배열 = 서버 정본(로컬 삭제)"으로 바뀌어서, 로컬 Store에
// supabaseId 있는 차량/거래처를 시드한 테스트는 가짜 서버에도 같은 행을 돌려줘야
// hydrate가 그 데이터를 지우지 않는다. buildVehicleRow/buildClientRow처럼 raw에
// 로컬 객체를 통째로 담는다(mergeCars/ClientsFromRows가 raw.* 를 읽는다).

/**
 * @param {Array<import('../domain/financeTypes.js').CarLike>} cars
 * @returns {Array<import('../store/atomicPersist.js').JsonValue>}
 */
export function vehicleRowsFor(cars) {
  /** @type {Array<import('../store/atomicPersist.js').JsonValue>} */
  const rows = []
  for (const car of cars || []) {
    if (!car || car.supabaseId == null) continue
    rows.push({
      id: car.supabaseId,
      number: car.number || '',
      type: car.type === 'sub' ? 'sub' : 'main',
      tonnage: car.tonnage || '',
      driver_name: car.driverName || '',
      raw: { id: car.id || '', number: car.number || '', driverName: car.driverName || '', driverPhone: car.driverPhone || '' },
    })
  }
  return rows
}

/**
 * @param {Array<import('../domain/clientTypes.js').ClientLike>} clients
 * @returns {Array<import('../store/atomicPersist.js').JsonValue>}
 */
export function clientRowsFor(clients) {
  /** @type {Array<import('../store/atomicPersist.js').JsonValue>} */
  const rows = []
  for (const client of clients || []) {
    if (!client || client.supabaseId == null) continue
    rows.push({
      id: client.supabaseId,
      legacy_client_id: client.id || '',
      company_name: client.companyName || '',
      is_pinned: !!client.isPinned,
      raw: {
        phone: client.phone || '',
        fixedRouteLinked: !!client.fixedRouteLinked,
        fixedUnitPrice: String(client.fixedUnitPrice ?? ''),
        palletOn: !!client.palletOn,
        palletPrice: String(client.palletPrice ?? ''),
      },
    })
  }
  return rows
}
