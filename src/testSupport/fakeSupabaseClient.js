// Step 0-4 감사 보완 4차: hydrate/outbox/syncQueue 테스트가 공유하는 가짜 supabase
// 클라이언트. mock.module()로 실제 supabaseClient.js를 바꿔치기하는 각 테스트 파일이
// 이 팩토리로 handlers/callCounts를 매번 새로 만든다(파일 간 상태 공유 없음 — 테스트
// 독립성).
export function chainable(getResult) {
  return {
    select: () => chainable(getResult),
    eq: () => chainable(getResult),
    neq: () => chainable(getResult),
    order: () => chainable(getResult),
    maybeSingle: () => chainable(getResult),
    single: () => chainable(getResult),
    then: (onFulfilled, onRejected) => Promise.resolve().then(getResult).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve().then(getResult).catch(onRejected),
  }
}

/** @returns {{ fakeSupabase, handlers, callCounts, resetHandlers, countOf, emptyOkHandlers }} */
export function createFakeSupabase() {
  const handlers = {}
  const callCounts = {}

  function resetHandlers() {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    Object.keys(callCounts).forEach((key) => delete callCounts[key])
  }

  function bump(table, method) {
    const key = `${table}.${method}`
    callCounts[key] = (callCounts[key] || 0) + 1
  }

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
    from(table) {
      const h = handlers[table] || {}
      return {
        select: () => { bump(table, 'select'); return chainable(h.select || (() => ({ data: [], error: null }))) },
        upsert: (row) => { bump(table, 'upsert'); return chainable(() => (h.upsert ? h.upsert(row) : { data: null, error: null })) },
        insert: (row) => { bump(table, 'insert'); return chainable(() => (h.insert ? h.insert(row) : { data: null, error: null })) },
        update: (row) => { bump(table, 'update'); return chainable(() => (h.update ? h.update(row) : { data: null, error: null })) },
        delete: () => { bump(table, 'delete'); return chainable(h.delete || (() => ({ data: null, error: null }))) },
      }
    },
    auth: { signOut: async () => ({ error: null }) },
  }

  return { fakeSupabase, handlers, callCounts, resetHandlers, countOf, emptyOkHandlers }
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
