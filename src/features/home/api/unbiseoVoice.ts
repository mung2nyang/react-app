// 운비서 목소리 함수(unbiseo-voice) 부르기 — 소리 파일만 받아 오고 저장하지 않는다(로드맵 24-E2).
import { supabase } from '../../../data/cloud/supabaseClient.ts'

const TEXT_MAX = 300
const VOICE_TIMEOUT_MS = 5000

/** 답 문장 → mp3 소리. 오류·5초 넘음·빈 소리면 null(휴대폰 목소리로 대신 읽는다). */
export async function requestUnbiseoVoice(sentence: string): Promise<Blob | null> {
  const text = sentence.trim()
  if (!text || text.length > TEXT_MAX) return null
  try {
    const { data, error } = await supabase.functions.invoke('unbiseo-voice', { body: { text }, timeout: VOICE_TIMEOUT_MS })
    if (error || !(data instanceof Blob) || data.size === 0) return null
    return new Blob([data], { type: 'audio/mpeg' })
  } catch {
    return null
  }
}
