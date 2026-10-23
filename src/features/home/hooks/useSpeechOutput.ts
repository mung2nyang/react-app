// xAI 목소리를 먼저, 못 받으면 휴대폰 기본 목소리로 읽는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { requestUnbiseoVoice } from '../api/unbiseoVoice.ts'

/** 읽기 한 번 — 소리를 받는 동안·트는 동안 같은 것을 가리킨다. */
type Reading = { audio: HTMLAudioElement | null, url: string, onDevice: boolean }

function engine(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return null
  return typeof window.SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null
}

function canPlayAudio(): boolean {
  return typeof window !== 'undefined' && typeof window.Audio === 'function' && typeof URL.createObjectURL === 'function'
}

function releaseSound(reading: Reading) {
  reading.audio?.pause()
  reading.audio = null
  if (reading.url) URL.revokeObjectURL(reading.url)
  reading.url = ''
}

export default function useSpeechOutput() {
  const [speaking, setSpeaking] = useState(false)
  const currentRef = useRef<Reading | null>(null)
  const supported = engine() !== null || canPlayAudio()

  const end = useCallback((reading: Reading) => {
    releaseSound(reading)
    if (currentRef.current !== reading) return
    currentRef.current = null
    setSpeaking(false)
  }, [])

  const stop = useCallback(() => {
    const reading = currentRef.current
    currentRef.current = null
    setSpeaking(false)
    if (!reading) return
    releaseSound(reading)
    if (reading.onDevice) engine()?.cancel()
  }, [])

  // 소리를 못 받았거나 못 틀었으면 휴대폰 목소리로 — 한 번만.
  const speakOnDevice = useCallback((sentence: string, reading: Reading) => {
    if (reading.onDevice) return
    const synth = engine()
    releaseSound(reading)
    if (!synth || currentRef.current !== reading) { end(reading); return }
    reading.onDevice = true
    const utterance = new window.SpeechSynthesisUtterance(sentence)
    utterance.lang = 'ko-KR'
    utterance.onend = () => end(reading)
    utterance.onerror = () => end(reading)
    synth.speak(utterance)
  }, [end])

  const speak = useCallback((sentence: string) => {
    if (!sentence || (!engine() && !canPlayAudio())) return
    stop()
    const reading: Reading = { audio: null, url: '', onDevice: false }
    currentRef.current = reading
    setSpeaking(true)
    const sound = canPlayAudio() ? requestUnbiseoVoice(sentence) : Promise.resolve(null)
    void sound.then((blob) => {
      if (currentRef.current !== reading) return
      if (!blob) { speakOnDevice(sentence, reading); return }
      reading.url = URL.createObjectURL(blob)
      const audio = new window.Audio(reading.url)
      reading.audio = audio
      audio.onended = () => end(reading)
      audio.onerror = () => speakOnDevice(sentence, reading)
      audio.play().catch(() => speakOnDevice(sentence, reading))
    })
  }, [stop, end, speakOnDevice])

  useEffect(() => () => {
    const reading = currentRef.current
    currentRef.current = null
    if (!reading) return
    releaseSound(reading)
    if (reading.onDevice) engine()?.cancel()
  }, [])

  return { supported, speaking, speak, stop }
}
