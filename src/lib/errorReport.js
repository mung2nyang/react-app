// @ts-check
// 앱에서 난 오류를 서버 client_errors 표에 한 줄 남긴다(로드맵 55-B) — 로그인 사용자만, 보내고 끝(기다림·재시도·기기 저장 없음).
// 화면 주소는 경로만(? 뒤 안 보냄), 한 번 켠 앱에서 최대 10건, 같은 문구는 한 번만.
import { supabase } from '../supabaseClient.js'
import { getCloudUserId } from './cloudSession.js'

export const MAX_REPORTS_PER_LOAD = 10
/** @type {Set<string>} */
const sentMessages = new Set()

/** @param {string|undefined} text @param {number} max */
function cut(text, max) {
  return String(text ?? '').slice(0, max)
}

/**
 * window 오류·거부 이유는 Error일 수도, 글자일 수도 있다.
 * @param {{ message?: string, stack?: string }|string|null|undefined} value
 * @returns {{ message: string, stack: string }}
 */
export function describeError(value) {
  if (typeof value === 'string') return { message: value, stack: '' }
  if (value && typeof value === 'object') return { message: String(value.message ?? ''), stack: String(value.stack ?? '') }
  return { message: String(value ?? ''), stack: '' }
}

/**
 * @param {{ kind: 'render'|'error'|'unhandledrejection', message?: string, stack?: string }} report
 * @returns {boolean} 보냈으면 true
 */
export function reportClientError({ kind, message = '', stack = '' }) {
  if (!getCloudUserId() || sentMessages.size >= MAX_REPORTS_PER_LOAD) return false
  const text = cut(message, 500)
  if (sentMessages.has(text)) return false
  sentMessages.add(text)
  try {
    void supabase.from('client_errors').insert({
      kind,
      message: text,
      stack: cut(stack, 2000),
      path: cut(window.location.pathname, 300),
      user_agent: cut(window.navigator.userAgent, 200),
    }).then(() => {}, () => {})
  } catch {
    // 기록 실패는 조용히 넘긴다 — 오류 기록이 또 오류를 부르지 않게.
  }
  return true
}

/**
 * @typedef {{ error?: { message?: string, stack?: string }|string|null, message?: string, reason?: { message?: string, stack?: string }|string|null }} ErrorLikeEvent
 * @param {{ addEventListener: (type: 'error'|'unhandledrejection', listener: (event: ErrorLikeEvent) => void) => void }} win
 */
export function installErrorReporting(win) {
  win.addEventListener('error', (event) => {
    reportClientError({ kind: 'error', ...describeError(event.error ?? event.message) })
  })
  win.addEventListener('unhandledrejection', (event) => {
    reportClientError({ kind: 'unhandledrejection', ...describeError(event.reason) })
  })
}

export function resetErrorReportsForTests() {
  sentMessages.clear()
}
