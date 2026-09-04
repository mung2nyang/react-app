import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveWorkLogCloseTarget } from './workLogNavigation.js'

describe('resolveWorkLogCloseTarget — 일지 닫기 후 Back 비재진입', () => {
  test('달력 셀 클릭으로 들어왔으면(state.from === "calendar") 뒤로가기(-1)', () => {
    assert.deepEqual(resolveWorkLogCloseTarget({ from: 'calendar' }), { mode: 'back' })
  })

  test('직접 진입(state 없음)이면 /app으로 교체 이동한다 — 이후 뒤로가기가 일지로 재진입하지 않는다', () => {
    assert.deepEqual(resolveWorkLogCloseTarget(null), { mode: 'replace', to: '/app' })
    assert.deepEqual(resolveWorkLogCloseTarget(undefined), { mode: 'replace', to: '/app' })
  })

  test('서브 차량 일지 직접 진입이면 /app/logs/:번호 달력으로 교체 이동', () => {
    assert.deepEqual(
      resolveWorkLogCloseTarget(null, '서울12가3456'),
      { mode: 'replace', to: `/app/logs/${encodeURIComponent('서울12가3456')}` },
    )
  })

  test('state는 있지만 from이 calendar가 아니면(알림 등 다른 경로) 역시 교체 이동', () => {
    assert.deepEqual(resolveWorkLogCloseTarget({ from: 'notification' }), { mode: 'replace', to: '/app' })
  })
})
