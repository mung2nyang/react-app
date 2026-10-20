// @ts-check
// 화면 아래 알림 — 실패 문구면 빨간 바탕·느낌표·바로 읽어 줌(로드맵 83), 문장마다 새 줄.
import { isFailureMessage } from '../shared/utils/failureMessages.js'

/**
 * 마침표·물음표·느낌표 뒤 띄어쓰기에서 문장을 나눈다. 띄어쓰기는 다음 문장 앞에 남겨 글자 전체는 그대로.
 * @param {string} message
 */
function splitSentences(message) {
  return message.split(/(?<=[.!?])(?=\s)/)
}

/** @param {{ message: string }} props */
export default function ToastMessage({ message }) {
  if (!message) return null
  const lines = splitSentences(message).map((sentence, index) => (
    <span key={index} className="toast-line">{sentence}</span>
  ))
  if (!isFailureMessage(message)) return <div className="toast-message" role="status">{lines}</div>
  return (
    <div className="toast-message is-error" role="alert">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="7.5" x2="12" y2="13" />
        <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
      </svg>
      <span>{lines}</span>
    </div>
  )
}
