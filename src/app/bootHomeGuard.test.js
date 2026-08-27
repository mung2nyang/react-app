import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isAlreadyInAppOnBoot } from './bootHomeGuard.js'

// Step 5(달력 홈 재작성) 재감사 6번 — App.jsx의 부트 세션 복원이 이미 /app(또는
// /onboarding)에 진입해 있었을 때만 goHome()을 건너뛰게 하는 판단(App.test.js의
// "재감사 4번 — 로그인 세션 복원..." 테스트가 실제 렌더로 이 계약을 함께 검증한다).
describe('isAlreadyInAppOnBoot — 부트 복원 시 goHome() 생략 판단', () => {
  test('/app 및 그 하위 경로는 true', () => {
    assert.equal(isAlreadyInAppOnBoot('/app'), true)
    assert.equal(isAlreadyInAppOnBoot('/app/day/2026-08-06'), true)
    assert.equal(isAlreadyInAppOnBoot('/app/me/settings'), true)
  })

  test('/onboarding은 true', () => {
    assert.equal(isAlreadyInAppOnBoot('/onboarding'), true)
  })

  test('/auth 등 그 외 경로는 false — goHome()으로 /app을 새로 연다', () => {
    assert.equal(isAlreadyInAppOnBoot('/auth'), false)
    assert.equal(isAlreadyInAppOnBoot('/'), false)
  })

  // 재감사(2차) — `.startsWith('/app')`이던 예전 구현은 접두어만 같으면 무관한
  // 경로도 true로 잘못 판정했다. `/app`/`/onboarding` "그 자체이거나 그 아래
  // 세그먼트"만 true여야 한다.
  test('접두어만 같고 세그먼트가 다른 경로는 false', () => {
    assert.equal(isAlreadyInAppOnBoot('/application'), false)
    assert.equal(isAlreadyInAppOnBoot('/app-old'), false)
    assert.equal(isAlreadyInAppOnBoot('/onboarding-old'), false)
  })
})
