// 로드맵 21: 당겨서 새로고침 — 시작해도 되나·당긴 정도·놓았을 때.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { canStartPull, pullDistance, releasePull, insideBlockedArea, PULL_MAX, PULL_TRIGGER } = await import('./usePullToRefresh.js')

test('시작: 설치 앱 + 맨 위 + 손가락 하나 + 보통 화면일 때만', () => {
  const ok = { standalone: true, scrollTop: 0, touches: 1, blocked: false }
  assert.equal(canStartPull(ok), true)
  assert.equal(canStartPull({ ...ok, standalone: false }), false, '브라우저 탭')
  assert.equal(canStartPull({ ...ok, scrollTop: 40 }), false, '맨 위 아님')
  assert.equal(canStartPull({ ...ok, touches: 2 }), false, '손가락 두 개')
  assert.equal(canStartPull({ ...ok, blocked: true }), false, '팝업·안쪽 스크롤 안')
})

test('막힌 곳: 화면 고정 상자·안쪽 스크롤 상자 안이면 막힘, 보통 화면은 안 막힘', () => {
  const page = document.createElement('div')
  const popup = document.createElement('div')
  const inPopup = document.createElement('span')
  const scroller = document.createElement('div')
  const inScroller = document.createElement('span')
  const plain = document.createElement('span')
  popup.appendChild(inPopup)
  scroller.appendChild(inScroller)
  page.append(popup, scroller, plain)
  document.body.appendChild(page)
  Object.defineProperty(scroller, 'scrollHeight', { value: 500 })
  Object.defineProperty(scroller, 'clientHeight', { value: 200 })
  /** @param {Element} el */
  const getStyle = (el) => ({
    position: el === popup ? 'fixed' : 'static',
    overflowY: el === scroller ? 'auto' : 'visible',
  })
  try {
    assert.equal(insideBlockedArea(inPopup, getStyle), true)
    assert.equal(insideBlockedArea(inScroller, getStyle), true)
    assert.equal(insideBlockedArea(plain, getStyle), false)
    assert.equal(insideBlockedArea(null, getStyle), false)
  } finally {
    page.remove()
  }
})

test('당긴 정도: 손가락 거리의 절반, 최대치까지, 위로 밀면 0', () => {
  assert.equal(pullDistance(40), 20)
  assert.equal(pullDistance(1000), PULL_MAX)
  assert.equal(pullDistance(-30), 0)
  assert.equal(pullDistance(PULL_TRIGGER * 2) >= PULL_TRIGGER, true, '트리거 거리의 두 배를 당기면 놓으면 새로고침')
})

test('놓기: 충분히 당겼고 확인 통과면 다시 불러오기 1번, 확인 취소·덜 당김이면 안 함', () => {
  let reloads = 0
  const reload = () => { reloads += 1 }
  assert.equal(releasePull(PULL_TRIGGER, () => true, reload), true)
  assert.equal(reloads, 1)
  assert.equal(releasePull(PULL_MAX, () => false, reload), false, '저장 덜 끝나 확인 취소')
  assert.equal(releasePull(PULL_TRIGGER - 1, () => true, reload), false, '덜 당김')
  assert.equal(reloads, 1)
})
