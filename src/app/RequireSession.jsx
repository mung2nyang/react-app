// @ts-check
// `/onboarding`·`/app/*`는 세션이 있어야 들어간다 — 주소를 바로 열어 들어오는 경우를 막는다.
// 판단은 sessionGate.js의 resolveSessionGate, 여기는 결과를 그리기만 한다.
import { Navigate } from 'react-router-dom'
import { resolveSessionGate } from './sessionGate.js'
import { isGuestModePersisted } from './guestSessionPersist.js'
import LoadingScreen from '../components/LoadingScreen.jsx'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

/**
 * @param {Object} props
 * @param {AppSession|null} [props.session]
 * @param {boolean} props.booting
 * @param {import('react').ReactNode} props.children
 */
export default function RequireSession({ session, booting, children }) {
  const gate = resolveSessionGate({ booting, session: session ?? null, guestModePersisted: isGuestModePersisted() })
  if (gate === 'loading') return <LoadingScreen />
  if (gate === 'redirect') return <Navigate to="/auth" replace />
  return children
}
