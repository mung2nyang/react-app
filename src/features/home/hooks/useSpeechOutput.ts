// 휴대폰 기본 읽어 주기(한국어) — 무료, 문장을 밖으로 보내지 않는다. 지원 안 하면 조용히 안 읽는다.
import { useCallback, useEffect, useRef, useState } from 'react'

function engine(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return null
  return typeof window.SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null
}

export default function useSpeechOutput() {
  const [speaking, setSpeaking] = useState(false)
  const currentRef = useRef<SpeechSynthesisUtterance | null>(null)
  const supported = engine() !== null

  const stop = useCallback(() => {
    const wasSpeaking = currentRef.current !== null
    currentRef.current = null
    setSpeaking(false)
    if (wasSpeaking) engine()?.cancel()
  }, [])

  const speak = useCallback((sentence: string) => {
    const synth = engine()
    if (!synth || !sentence) return
    currentRef.current = null
    synth.cancel()
    const utterance = new window.SpeechSynthesisUtterance(sentence)
    utterance.lang = 'ko-KR'
    const finish = () => {
      if (currentRef.current !== utterance) return
      currentRef.current = null
      setSpeaking(false)
    }
    utterance.onend = finish
    utterance.onerror = finish
    currentRef.current = utterance
    setSpeaking(true)
    synth.speak(utterance)
  }, [])

  useEffect(() => () => {
    if (currentRef.current) engine()?.cancel()
    currentRef.current = null
  }, [])

  return { supported, speaking, speak, stop }
}
