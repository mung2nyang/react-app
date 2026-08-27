// @ts-check
// Step 5(달력 홈 재작성) 재감사 6번: App.jsx의 부트 세션 복원 위치 판단을 순수 함수로
// 뺐다(200줄 제한 + sessionGate.js/workLogNavigation.js와 같은 관례 — React 렌더 없이
// 테스트할 수 있다).
//
// goHome()은 항상 쿼리 없는 '/app'으로 교체 이동한다(로그인/게스트 시작처럼 "새로
// 홈으로" 갈 때는 맞는 동작). 하지만 로그인 상태로 `/app?y=2026&m=6`처럼 달력 월
// 쿼리가 붙은 URL을 새로고침하면, 부트 복원이 매번 goHome()을 불러 그 쿼리를 지워
// 버려서 "새로고침 후 같은 달"(Step 5 완료 조건)이 로그인 사용자에게는 깨졌다 —
// 이미 /app(또는 /onboarding) 경로로 진입해 있었다면 세션만 채우고 경로/쿼리는
// 건드리지 않는다. /auth 등 다른 경로에 있었을 때만(=로그인 성공 직후 등) goHome()으로
// /app으로 옮긴다(기존 동작 그대로).

// 재감사(2차) — 경로 세그먼트 기준으로 고친다: `.startsWith('/app')`는 `/application`
// 처럼 `/app`으로 시작하기만 하는 무관한 경로도 true로 잘못 판정했다. `/app` 자체이거나
// `/app/`로 시작하는 것만(다음 문자가 경로 구분자 `/`인 경우만) 진짜 그 경로 트리 아래다.
const IN_APP_PREFIXES = ['/app', '/onboarding']

/**
 * @param {string} pathname
 * @returns {boolean} true면 부트 복원 시 goHome()을 부르지 않고 세션만 채운다.
 */
export function isAlreadyInAppOnBoot(pathname) {
  return IN_APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
