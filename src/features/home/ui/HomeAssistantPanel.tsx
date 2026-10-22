// 운비서 카드가 늘어난 부분 — 내가 한 말과 알아들은 내용을 글로 보여 준다. 문장은 앱이 만든다.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { isCloudSession } from '../../../data/cloud/cloudSession.ts'
import { useSession } from '../../../data/cloud/sessionContext.ts'
import { useOwnerClients } from '../../../data/store/ownerDataHooks.ts'
import { todayWorkLogSelection } from '../../../domain/calendar.ts'
import { describeResult, requestUnbiseoParse, TEXT_MAX } from '../api/unbiseoParse.ts'
import useSpeechInput from '../hooks/useSpeechInput.ts'

type Answer = { said: string, sentence: string }

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3"></rect>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="22"></line>
    </svg>
  )
}

export default function HomeAssistantPanel() {
  const { ownerKey, session } = useSession()
  const clients = useOwnerClients(ownerKey)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const speech = useSpeechInput((heard) => {
    setText(heard)
    void send(heard)
  })

  if (!isCloudSession(session)) {
    return <p className="home-assistant-note">로그인하면 쓸 수 있습니다.</p>
  }

  async function send(said: string) {
    const trimmed = said.trim()
    if (busy || !trimmed) return
    const today = todayWorkLogSelection(new Date()).dateKey
    setBusy(true)
    setAnswer({ said: trimmed, sentence: '알아듣는 중…' })
    const result = await requestUnbiseoParse({ text: trimmed, today, clientNames: clients.map((client) => client.companyName || '') })
    setAnswer({ said: trimmed, sentence: describeResult(result, today) })
    setBusy(false)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void send(text)
  }

  return (
    <div className="home-assistant-panel">
      <form className="home-assistant-form" onSubmit={onSubmit}>
        {speech.supported && (
          <button
            type="button"
            className={`home-assistant-mic-btn${speech.listening ? ' listening' : ''}`}
            aria-label={speech.listening ? '듣기 멈추기' : '말하기'}
            disabled={busy}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
          >
            <MicIcon />
          </button>
        )}
        <input
          className="input-box home-assistant-input"
          aria-label="운비서에게 보낼 말"
          placeholder="예: 어제 수원 화성 15만"
          maxLength={TEXT_MAX}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="home-assistant-send" disabled={busy || !text.trim()}>보내기</button>
      </form>
      {speech.listening && <p className="home-assistant-note">듣는 중…</p>}
      {speech.error && <p className="home-assistant-note">{speech.error}</p>}
      {answer && (
        <div className="home-assistant-answer" aria-live="polite">
          <p className="home-assistant-said">내가 한 말: {answer.said}</p>
          <p className="home-assistant-result">{answer.sentence}</p>
        </div>
      )}
    </div>
  )
}
