// @ts-check
// 지금 보는 사람(ownerKey)과 로그인 정보(session) — 앱 맨 위 공급자에서 꺼내 쓴다(손으로 넘기지 않음). 공급자 밖은 비회원(guest).
import { createContext, createElement, useContext } from 'react'

/** @typedef {{ session: import('../sync/syncTypes.js').AppSession|null, ownerKey: string }} SessionValue */

/** @type {SessionValue} */
const GUEST = { session: null, ownerKey: 'guest' }

const SessionContext = createContext(GUEST)

/** @param {{ value: SessionValue, children?: import('react').ReactNode }} props */
export function SessionProvider({ value, children }) {
  return createElement(SessionContext.Provider, { value }, children)
}

/** @returns {SessionValue} */
export function useSession() {
  return useContext(SessionContext)
}
