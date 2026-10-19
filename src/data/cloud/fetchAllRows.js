// @ts-check
// 서버(Supabase Max rows 1000)는 한 번에 1,000줄까지만 준다 — 끝까지 이어 받는다. 묶음 크기는 그 설정값과 같아야 한다.

export const PAGE_SIZE = 1000

/** @typedef {import('../hydrate/hydrateMergeTypes.js').SupabaseQueryError} SupabaseQueryError */

/**
 * 묶음마다 새 쿼리(필터·정렬 포함, 정렬 끝에 id)를 만들어 끝까지 받는다. 중간 오류면 받은 것을 버리고 오류만 돌려준다.
 * @template Row
 * @param {() => { range: (from: number, to: number) => PromiseLike<{ data: Array<Row>|null, error: SupabaseQueryError }> }} buildQuery
 * @returns {Promise<{ data: Array<Row>|null, error: SupabaseQueryError }>}
 */
export async function fetchAllRows(buildQuery) {
  /** @type {Array<Row>} */
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
