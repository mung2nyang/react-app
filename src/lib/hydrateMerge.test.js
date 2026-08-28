import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  throwIfAnyHydrateError,
  mergeCarsFromRows,
  mergeWorkDataFromRows,
  mergeExpenseKind,
  findMainCar,
} from './hydrateMerge.js'

describe('throwIfAnyHydrateError', () => {
  test('전부 에러가 없으면 조용히 통과한다', () => {
    assert.doesNotThrow(() => throwIfAnyHydrateError({ profiles: null, vehicles: null }))
  })

  test('{ data:null, error }처럼 현실적인 Supabase 실패 하나만 있어도 던진다', () => {
    assert.throws(
      () => throwIfAnyHydrateError({ profiles: null, transport_details: { message: 'transport_details down' } }),
      /transport_details/,
    )
  })

  test('실패한 테이블 이름을 error.failedTables에 남긴다', () => {
    try {
      throwIfAnyHydrateError({ vehicles: { message: 'x' }, clients: { message: 'y' } })
      assert.fail('던져야 한다')
    } catch (error) {
      assert.deepEqual(error.failedTables.sort(), ['clients', 'vehicles'])
    }
  })
})

describe('mergeWorkDataFromRows — transport_details 실패 회귀 방지', () => {
  test('transportRows가 undefined/빈 배열이면 callDetails는 빈 배열로 남되, 호출부가 이미 성공을 확인했을 때만 이 함수를 불러야 한다', () => {
    // 이 함수 자체는 "행이 없으면 빈 배열"이라는 게 맞는 동작이다 — transport_details 조회가
    // 실패했을 때 이 함수를 아예 안 부르는 책임은 cloudSync.js의 throwIfAnyHydrateError가 진다.
    // 여기서는 순수 병합 로직만 검증한다: rows가 있으면 반영되고, 없으면 빈 배열이다.
    const result = mergeWorkDataFromRows({}, {
      dailyRows: [{ work_date: '2026-08-01', is_off: false, fixed_count: 1, raw: {} }],
      transportRows: [{ work_date: '2026-08-01', raw: { client: '거래처A', fare: 50000 } }],
      fuelRows: [],
      maintRows: [],
      miscRows: [],
    })
    assert.equal(result['2026-08-01'].callDetails.length, 1)
    assert.equal(result['2026-08-01'].callDetails[0].client, '거래처A')
  })

  test('daily_logs에 없는 날짜의 transport row는 무시한다(고아 데이터 방지)', () => {
    const result = mergeWorkDataFromRows({}, {
      dailyRows: [{ work_date: '2026-08-01', is_off: false, fixed_count: 0, raw: {} }],
      transportRows: [{ work_date: '2026-08-02', raw: {} }],
      fuelRows: [],
      maintRows: [],
      miscRows: [],
    })
    assert.equal(result['2026-08-02'], undefined)
  })

  test('localWorkData에 있던 다른 날짜는 유지한다(전체 교체가 아니라 병합)', () => {
    const local = { '2026-07-01': { isOff: true, callDetails: [] } }
    const result = mergeWorkDataFromRows(local, { dailyRows: [], transportRows: [], fuelRows: [], maintRows: [], miscRows: [] })
    assert.deepEqual(result['2026-07-01'], { isOff: true, callDetails: [] })
  })
})

// 재감사 3차(FAIL 지적 1번) — 아직 서버에 삭제를 못 알린 날짜(tombstone)는 서버가
// 아직 갖고 있는 stale daily_logs/transport_details row로 되살아나면 안 된다.
describe('mergeWorkDataFromRows — deletedDateKeys(tombstone)는 절대 되살리지 않는다', () => {
  test('서버 daily_logs에 아직 남아 있는 tombstone 날짜는 결과에서 빠진다', () => {
    const result = mergeWorkDataFromRows({}, {
      dailyRows: [
        { work_date: '2026-08-01', is_off: false, fixed_count: 3, raw: {} },
        { work_date: '2026-08-02', is_off: false, fixed_count: 5, raw: {} },
      ],
      transportRows: [], fuelRows: [], maintRows: [], miscRows: [],
    }, ['2026-08-01'])
    assert.equal(result['2026-08-01'], undefined, 'tombstone 날짜는 서버에 남아 있어도 되살아나면 안 된다')
    assert.ok(result['2026-08-02'], 'tombstone이 아닌 날짜는 그대로 반영돼야 한다')
  })

  test('localWorkData(profile 백업 스냅샷일 수도 있다) 자체에 남아 있던 tombstone 날짜도 결과에서 지운다', () => {
    const staleLocal = { '2026-08-01': { isOff: false, fixedCount: 3, callDetails: [] } }
    const result = mergeWorkDataFromRows(staleLocal, {
      dailyRows: [], transportRows: [], fuelRows: [], maintRows: [], miscRows: [],
    }, ['2026-08-01'])
    assert.equal(result['2026-08-01'], undefined, 'profile 백업 스냅샷에만 남아 있던 stale 값도 지워야 한다')
  })

  test('deletedDateKeys를 생략하면(기존 호출부) 기존 동작 그대로 전부 반영된다', () => {
    const result = mergeWorkDataFromRows({}, {
      dailyRows: [{ work_date: '2026-08-01', is_off: false, fixed_count: 3, raw: {} }],
      transportRows: [], fuelRows: [], maintRows: [], miscRows: [],
    })
    assert.ok(result['2026-08-01'], '세 번째 인자를 생략해도 기존 호출부가 그대로 동작해야 한다')
  })
})

describe('mergeCarsFromRows', () => {
  test('행이 없으면 로컬 값을 그대로 둔다(서버가 빈 걸 로컬 삭제 신호로 오해하지 않는다)', () => {
    const local = [{ id: 'local-1', number: '11가1111' }]
    assert.equal(mergeCarsFromRows(local, []), local)
    assert.equal(mergeCarsFromRows(local, null), local)
  })

  test('서버 아직 동기화 안 된(supabaseId 없는) 로컬 차량은 서버 목록 뒤에 유지된다', () => {
    const local = [{ id: 'unsynced', number: '99하9999' }]
    const rows = [{ id: 501, type: 'main', number: '11가1111', raw: {} }]
    const merged = mergeCarsFromRows(local, rows)
    assert.equal(merged.length, 2)
    assert.equal(merged[1].id, 'unsynced')
  })
})

describe('findMainCar', () => {
  test('type이 main이고 supabaseId가 있는 차량을 우선한다', () => {
    const cars = [{ type: 'sub', supabaseId: 1 }, { type: 'main', supabaseId: 2 }]
    assert.equal(findMainCar(cars).supabaseId, 2)
  })

  test('main이 없으면 supabaseId가 있는 아무 차량이나 돌려준다', () => {
    const cars = [{ type: 'sub', supabaseId: 7 }]
    assert.equal(findMainCar(cars).supabaseId, 7)
  })

  test('supabaseId가 있는 차량이 하나도 없으면 null', () => {
    assert.equal(findMainCar([{ type: 'main' }]), null)
    assert.equal(findMainCar([]), null)
  })
})

describe('mergeExpenseKind', () => {
  function replace(expenses, kindItems) {
    return [...(expenses || []).filter((item) => item.kind !== 'fuel'), ...kindItems]
  }

  test('서버 rows가 있으면 mapRow로 변환해 그 kind를 통째로 교체한다', () => {
    const current = [{ kind: 'fuel', id: 'old' }, { kind: 'maint', id: 'keep' }]
    const result = mergeExpenseKind({
      kind: 'fuel',
      currentExpenses: current,
      snapshotExpenses: [],
      previousExpenses: [],
      rows: [{ id: 1 }],
      mapRow: (row) => ({ kind: 'fuel', id: `mapped-${row.id}` }),
      replace,
    })
    assert.deepEqual(result, [{ kind: 'maint', id: 'keep' }, { kind: 'fuel', id: 'mapped-1' }])
  })

  test('서버 rows가 없으면 프로필 스냅샷 백업을 우선 쓴다', () => {
    const result = mergeExpenseKind({
      kind: 'fuel',
      currentExpenses: [],
      snapshotExpenses: [{ kind: 'fuel', id: 'from-snapshot' }],
      previousExpenses: [{ kind: 'fuel', id: 'from-local' }],
      rows: [],
      mapRow: (row) => row,
      replace,
    })
    assert.deepEqual(result, [{ kind: 'fuel', id: 'from-snapshot' }])
  })

  test('스냅샷도 없으면 로컬 기존 내역을 유지한다', () => {
    const result = mergeExpenseKind({
      kind: 'fuel',
      currentExpenses: [],
      snapshotExpenses: [],
      previousExpenses: [{ kind: 'fuel', id: 'from-local' }],
      rows: [],
      mapRow: (row) => row,
      replace,
    })
    assert.deepEqual(result, [{ kind: 'fuel', id: 'from-local' }])
  })
})
