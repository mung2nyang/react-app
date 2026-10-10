// @ts-check
// 부트 세션 복원 뒤 홈으로 옮길지 정하는 순수 함수. 이미 /app·/onboarding에 있으면 경로·쿼리(달력 월)를
// 지키려고 그대로 두고, /auth 등 다른 곳에 있을 때만 홈으로 옮긴다.

// 경로 단위로 본다 — `/app` 자체이거나 `/app/`로 시작할 때만(`/application` 같은 건 아님).
const IN_APP_PREFIXES = ['/app', '/onboarding']

/**
 * @param {string} pathname
 * @returns {boolean} true면 부트 복원 시 goHome()을 부르지 않고 세션만 채운다.
 */
export function isAlreadyInAppOnBoot(pathname) {
  return IN_APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
