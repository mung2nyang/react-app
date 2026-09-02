// store/*.test.js는 supabase 동작 자체를 테스트하지 않는데도, app-store.js가
// (scheduleCloudSync를 통해) cloudSync.js를 임포트하면 그게 실제 supabaseClient.js의
// createClient()를 불러서 Node 테스트 프로세스가 안 끝나고 매달리는 문제가 있었다
// (Node 21+ realtime/auth 내부 타이머가 이벤트 루프를 붙잡는다). 이 파일을 다른 임포트보다
// 먼저 부작용으로 임포트하면, 실제 네트워크 클라이언트 대신 아무것도 안 하는 스텁이 쓰인다.
// --experimental-test-module-mocks 플래그가 있어야 동작한다(package.json의 test 스크립트).
import { mock } from 'node:test'

/** @typedef {{ data: unknown, error: { message: string }|null }} StubQueryResult */
/** @typedef {'select'|'upsert'|'insert'|'update'|'delete'} StubMethod */

/** @type {Record<StubMethod, number>} */
export const stubSupabaseCallCounts = { select: 0, upsert: 0, insert: 0, update: 0, delete: 0 }

/** @returns {Record<'select'|'upsert'|'insert'|'update'|'delete', () => Promise<StubQueryResult>>} */
function defaultMethodImpls() {
  return {
    select: async () => ({ data: [], error: null }),
    upsert: async () => ({ data: null, error: null }),
    insert: async () => ({ data: null, error: null }),
    update: async () => ({ data: null, error: null }),
    delete: async () => ({ data: null, error: null }),
  }
}

/** @type {ReturnType<typeof defaultMethodImpls>} */
export let stubSupabaseMethodImpls = defaultMethodImpls()

export function resetStubSupabaseCallCounts() {
  stubSupabaseCallCounts.select = 0
  stubSupabaseCallCounts.upsert = 0
  stubSupabaseCallCounts.insert = 0
  stubSupabaseCallCounts.update = 0
  stubSupabaseCallCounts.delete = 0
  stubSupabaseMethodImpls = defaultMethodImpls()
}

/** @param {StubMethod} method */
function bumpStubCall(method) {
  stubSupabaseCallCounts[method] += 1
}

/** @param {'select'|'upsert'|'insert'|'update'|'delete'} method */
function createQuery(method) {
  bumpStubCall(method)
  const query = {
    eq() { return query },
    in() { return query },
    order() { return query },
    select() { return query },
    single() { return query },
    maybeSingle() { return query },
    /**
     * @param {(value: StubQueryResult) => unknown} [onFulfilled]
     * @param {(reason: unknown) => unknown} [onRejected]
     */
    then(onFulfilled, onRejected) {
      return Promise.resolve(stubSupabaseMethodImpls[method]()).then(onFulfilled, onRejected)
    },
  }
  return query
}

mock.module('../supabaseClient.js', {
  namedExports: {
    supabase: {
      from() {
        return {
          select: () => createQuery('select'),
          upsert: () => createQuery('upsert'),
          insert: () => createQuery('insert'),
          update: () => createQuery('update'),
          delete: () => createQuery('delete'),
        }
      },
      auth: { signOut: async () => ({ error: null }) },
    },
  },
})
