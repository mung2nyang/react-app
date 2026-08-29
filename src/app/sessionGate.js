// Step 0-4 감사 보완: RequireSession.jsx가 어떤 화면을 보여줄지 정하는 순수 함수.
// 로직을 여기 빼 둬서 React 렌더 없이도 "세션 없는 딥링크가 막히는지"를 테스트할 수 있다.

/**
 * @typedef {'loading' | 'redirect' | 'allow'} SessionGateResult
 */

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

/**
 * @param {{ booting: boolean, session: AppSession | null }} args
 * @returns {SessionGateResult}
 *   loading: 부트 중이라 세션이 있는지 아직 모른다 — 로딩 문구만 보여준다.
 *   redirect: 부트가 끝났는데 세션이 없다 — /auth로 보낸다(세션 없이 새로고침/북마크로
 *     /app/... 딥링크 진입하는 것을 막는다).
 *   allow: 세션이 있다 — 요청한 화면을 그대로 그린다.
 */
export function resolveSessionGate({ booting, session }) {
  if (booting) return 'loading'
  if (!session) return 'redirect'
  return 'allow'
}
