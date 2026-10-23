// 로드맵 108 — 운비서 버튼 위치: 놓은 곳 → 가까운 가장자리·높이 한계, 저장 값이 깨졌으면 기본 자리.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { snapDockPosition, toDockPosition } from './useDockPosition.ts'

// 앱 폭 480px(가운데 240), 자리 틀 아래 끝 700px — 기본 동그라미 아래 끝은 692px(틈 8px).
const dock = { left: 0, right: 480, top: 640, bottom: 700 }
/** @param {number} left @param {number} bottom */
const fab = (left, bottom) => ({ left, right: left + 52, top: bottom - 52, bottom })

test('가로 가운데보다 왼쪽에 놓으면 왼쪽, 아니면 오른쪽 가장자리', () => {
  assert.equal(snapDockPosition(fab(150, 692), dock).side, 'left')
  assert.equal(snapDockPosition(fab(214, 692), dock).side, 'right', '가운데(240)에 걸치면 오른쪽')
  assert.equal(snapDockPosition(fab(300, 692), dock).side, 'right')
})

test('높이는 놓은 곳 그대로, 아래 메뉴 위보다 낮아지지 않고 화면 위 12px 안', () => {
  assert.equal(snapDockPosition(fab(400, 492), dock).lift, 200)
  assert.equal(snapDockPosition(fab(400, 750), dock).lift, 0, '아래 메뉴 아래로 끌어도 기본 높이')
  assert.equal(snapDockPosition(fab(400, 10), dock).lift, 692 - 52 - 12, '위로 끝까지 끌어도 위 12px')
})

test('저장 값이 없거나 깨졌으면 기본 자리(오른쪽, 높이 0)', () => {
  const base = { side: 'right', lift: 0 }
  assert.deepEqual(toDockPosition(JSON.stringify({ side: 'left', lift: 120 })), { side: 'left', lift: 120 })
  assert.deepEqual(toDockPosition(null), base)
  assert.deepEqual(toDockPosition('{'), base)
  assert.deepEqual(toDockPosition('null'), base)
  assert.deepEqual(toDockPosition(JSON.stringify({ side: 'top', lift: 10 })), base)
  assert.deepEqual(toDockPosition(JSON.stringify({ side: 'left', lift: -5 })), base)
  assert.deepEqual(toDockPosition(JSON.stringify({ side: 'left', lift: '30' })), base)
})
