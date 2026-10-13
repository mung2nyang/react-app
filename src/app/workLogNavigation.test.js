import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveWorkLogCloseTarget } from './workLogNavigation.js'

describe('resolveWorkLogCloseTarget — 일지 닫기 후 Back 비재진입', () => {
  test('달력 셀 클릭으로 들어왔으면(state.from === "calendar") 뒤로가기(-1)', () => {
    assert.deepEqual(resolveWorkLogCloseTarget({ from: 'calendar' }), { mode: 'back' })
  })

  test('홈 "오늘" 카드 버튼으로 들어왔으면(state.from === "home") 뒤로가기(-1)', () => {
    assert.deepEqual(resolveWorkLogCloseTarget({ from: 'home' }), { mode: 'back' })
  })

  test('직접 진입(state 없음)이면 달력 /app/calendar로 교체 이동한다 — 이후 뒤로가기가 일지로 재진입하지 않는다', () => {
    assert.deepEqual(resolveWorkLogCloseTarget(null), { mode: 'replace', to: '/app/calendar' })
    assert.deepEqual(resolveWorkLogCloseTarget(undefined), { mode: 'replace', to: '/app/calendar' })
  })

  test('서브 차량 일지 직접 진입이면 /app/logs/:번호 달력으로 교체 이동', () => {
    assert.deepEqual(
      resolveWorkLogCloseTarget(null, '서울12가3456'),
      { mode: 'replace', to: `/app/logs/${encodeURIComponent('서울12가3456')}` },
    )
  })

  test('state는 있지만 from이 calendar·home이 아니면(알림 등 다른 경로) 역시 교체 이동', () => {
    assert.deepEqual(resolveWorkLogCloseTarget({ from: 'notification' }), { mode: 'replace', to: '/app/calendar' })
  })
})

describe('resolveWorkLogCloseTarget — 교체 이동은 일지 날짜의 달로(로드맵 36)', () => {
  test('직접 진입한 2027-01-31 일지를 닫으면 2027년 1월 달력', () => {
    assert.deepEqual(resolveWorkLogCloseTarget(null, 'main', '2027-01-31'), { mode: 'replace', to: '/app/calendar?y=2027&m=0' })
  })

  test('서브 차량 일지도 그 달 달력', () => {
    assert.deepEqual(
      resolveWorkLogCloseTarget(null, '서울12가3456', '2026-12-05'),
      { mode: 'replace', to: `/app/logs/${encodeURIComponent('서울12가3456')}?y=2026&m=11` },
    )
  })

  test('달력에서 들어왔으면 날짜와 무관하게 뒤로가기(-1) 그대로', () => {
    assert.deepEqual(resolveWorkLogCloseTarget({ from: 'calendar' }, 'main', '2027-01-31'), { mode: 'back' })
  })
})
