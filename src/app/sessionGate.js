// Step 0-4 감사 보완: RequireSession.jsx가 어떤 화면을 보여줄지 정하는 순수 함수.
// 로직을 여기 빼 둬서 React 렌더 없이도 "세션 없는 딥링크가 막히는지"를 테스트할 수 있다.

/**
 * @typedef {'loading' | 'redirect' | 'allow'} SessionGateResult
 */

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

/**
 * @param {{ booting: boolean, session: AppSession | null, guestModePersisted?: boolean }} args
 * @returns {SessionGateResult}
 *   loading: 부트 중이라 세션이 있는지 아직 모른다 — 로딩 문구만 보여준다.
 *   redirect: 부트가 끝났는데 세션이 없고 게스트 플래그도 없다 — /auth로 보낸다.
 *   allow: 로그인/게스트 세션이 있거나, 게스트 모드가 localStorage에 확인됐다.
 */
export function resolveSessionGate({ booting, session, guestModePersisted = false }) {
  if (booting) return 'loading'
  if (session) return 'allow'
  if (guestModePersisted) return 'allow'
  return 'redirect'
}
