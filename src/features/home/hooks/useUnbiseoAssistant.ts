// 운비서 말하기·보내기 상태 — 줄의 마이크와 늘어난 카드가 같이 쓴다(로드맵 24-B).
import { useState } from 'react'
import { isCloudSession } from '../../../data/cloud/cloudSession.ts'
import { useSession } from '../../../data/cloud/sessionContext.ts'
import { useOwnerClients } from '../../../data/store/ownerDataHooks.ts'
import { todayWorkLogSelection } from '../../../domain/calendar.ts'
import { describeResult, requestUnbiseoParse } from '../api/unbiseoParse.ts'
import useSpeechInput from './useSpeechInput.ts'

export type UnbiseoAnswer = { said: string, sentence: string }

export default function useUnbiseoAssistant() {
  const { ownerKey, session } = useSession()
  const clients = useOwnerClients(ownerKey)
  const loggedIn = isCloudSession(session)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<UnbiseoAnswer | null>(null)
  const speech = useSpeechInput((heard) => {
    setText(heard)
    void send(heard)
  })

  async function send(said: string) {
    const trimmed = said.trim()
    if (!loggedIn || busy || !trimmed) return
    const today = todayWorkLogSelection(new Date()).dateKey
    setBusy(true)
    setAnswer({ said: trimmed, sentence: '알아듣는 중…' })
    const result = await requestUnbiseoParse({ text: trimmed, today, clientNames: clients.map((client) => client.companyName || '') })
    setAnswer({ said: trimmed, sentence: describeResult(result, today) })
    setBusy(false)
  }

  return { loggedIn, text, setText, busy, answer, send, speech }
}

export type UnbiseoAssistant = ReturnType<typeof useUnbiseoAssistant>
