// 지금 보는 사람(ownerKey)과 로그인 정보(session) — 앱 맨 위 공급자에서 꺼내 쓴다(손으로 넘기지 않음). 공급자 밖은 비회원(guest).
import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'
import type { AppSession } from '../sync/syncTypes.ts'

export type SessionValue = { session: AppSession | null, ownerKey: string }

const GUEST: SessionValue = { session: null, ownerKey: 'guest' }

const SessionContext = createContext(GUEST)

export function SessionProvider({ value, children }: { value: SessionValue, children?: ReactNode }) {
  return createElement(SessionContext.Provider, { value }, children)
}

export function useSession(): SessionValue {
  return useContext(SessionContext)
}
