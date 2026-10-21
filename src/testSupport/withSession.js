// @ts-check
// 테스트용 — 화면을 세션 공급자로 감싸 지금 보는 사람(ownerKey)과 로그인 정보(session)를 넘긴다.
import { createElement } from 'react'
import { SessionProvider } from '../data/cloud/sessionContext.js'

/**
 * @param {import('react').ReactNode} element
 * @param {{ ownerKey?: string, session?: import('../data/sync/syncTypes.js').AppSession|null }} value
 */
export function withSession(element, { ownerKey = 'guest', session = null }) {
  return createElement(SessionProvider, { value: { ownerKey, session } }, element)
}
