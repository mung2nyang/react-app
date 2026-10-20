// @ts-check
// 테스트용 — 화면을 알림 공급자로 감싸 띄운 알림 문구를 모은다.
import { createElement } from 'react'
import { ToastProvider } from '../shared/hooks/useToast.js'

/**
 * @param {import('react').ReactNode} element
 * @param {(message: string) => void} showToast
 */
export function withToast(element, showToast) {
  return createElement(ToastProvider, { value: showToast }, element)
}
