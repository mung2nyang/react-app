// 운비서 카드가 늘어난 부분 — 글 칸, 내가 한 말과 알아들은 내용을 글로 보여 준다. 문장은 앱이 만든다.
import type { FormEvent } from 'react'
import { TEXT_MAX } from '../api/unbiseoParse.ts'
import type { UnbiseoCall } from '../api/unbiseoParse.ts'
import type { UnbiseoAssistant } from '../hooks/useUnbiseoAssistant.ts'

type Props = { assistant: UnbiseoAssistant, onOpenCall?: (call: UnbiseoCall) => void }

export default function HomeAssistantPanel({ assistant, onOpenCall }: Props) {
  const { loggedIn, text, setText, busy, answer, send, speech, callDetailOn, enabling, enableCallDetail } = assistant
  const call = answer?.call

  if (!loggedIn) {
    return <p className="home-assistant-note">로그인하면 쓸 수 있습니다.</p>
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void send(text)
  }

  return (
    <div className="home-assistant-panel">
      <form className="home-assistant-form" onSubmit={onSubmit}>
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
          {call && callDetailOn && (
            <button type="button" className="home-assistant-action" onClick={() => onOpenCall?.(call)}>기록하기</button>
          )}
          {call && !callDetailOn && (
            <div className="home-assistant-enable">
              <p className="home-assistant-note">콜 상세가 꺼져 있어요. 켤까요?</p>
              <button type="button" className="home-assistant-action" disabled={enabling} onClick={() => void enableCallDetail()}>켜기</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
