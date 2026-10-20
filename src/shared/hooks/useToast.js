// @ts-check
// 화면 아래 알림 문구 — 앱 맨 위 공급자에서 꺼내 쓴다(손으로 넘기지 않음). 공급자 밖에선 아무 일 안 함.
import { createContext, createElement, useContext } from 'react'

/** @typedef {(message: string) => void} ShowToast */

/** @type {ShowToast} */
const ignoreToast = () => {}

const ToastContext = createContext(ignoreToast)

/** @param {{ value: ShowToast, children?: import('react').ReactNode }} props */
export function ToastProvider({ value, children }) {
  return createElement(ToastContext.Provider, { value }, children)
}

/** @returns {ShowToast} */
export function useToast() {
  return useContext(ToastContext)
}
