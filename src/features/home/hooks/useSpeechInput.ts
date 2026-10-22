// 휴대폰 크롬 받아쓰기(한국어). 지원 안 하면 글로만 쓴다.
import { useEffect, useRef, useState } from 'react'

type Recognizer = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognizerCtor = new () => Recognizer

export const MIC_DENIED = '마이크 권한을 켜 주세요. 글로 써도 됩니다.'
export const NO_SPEECH = '말소리가 들리지 않았어요. 다시 눌러 말해 주세요.'
export const SPEECH_FAILED = '받아쓰기를 하지 못했어요. 글로 써 주세요.'

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null
  const ctor = Reflect.get(window, 'SpeechRecognition') ?? Reflect.get(window, 'webkitSpeechRecognition')
  return typeof ctor === 'function' ? ctor : null
}

function errorMessage(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return MIC_DENIED
  if (code === 'no-speech') return NO_SPEECH
  return SPEECH_FAILED
}

/** 말이 끝나면 받아쓴 글자를 onFinal로 넘긴다. */
export default function useSpeechInput(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognizerRef = useRef<Recognizer | null>(null)
  const onFinalRef = useRef(onFinal)
  const supported = recognizerCtor() !== null

  useEffect(() => { onFinalRef.current = onFinal })
  useEffect(() => () => { recognizerRef.current?.abort() }, [])

  function start() {
    const Ctor = recognizerCtor()
    if (!Ctor || recognizerRef.current) return
    const recognizer = new Ctor()
    recognizer.lang = 'ko-KR'
    recognizer.continuous = false
    recognizer.interimResults = false
    recognizer.maxAlternatives = 1
    let heard = ''
    recognizer.onresult = (event) => {
      heard = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim()
    }
    recognizer.onerror = (event) => { setError(errorMessage(event.error)) }
    recognizer.onend = () => {
      recognizerRef.current = null
      setListening(false)
      if (heard) onFinalRef.current(heard)
    }
    recognizerRef.current = recognizer
    setError(null)
    setListening(true)
    try {
      recognizer.start()
    } catch {
      recognizerRef.current = null
      setListening(false)
      setError(SPEECH_FAILED)
    }
  }

  function stop() {
    recognizerRef.current?.stop()
  }

  return { supported, listening, error, start, stop }
}
