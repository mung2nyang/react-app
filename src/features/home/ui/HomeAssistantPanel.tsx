// 운비서 카드가 늘어난 부분 — 글 칸, 내가 한 말과 알아들은 내용을 글로 보여 준다. 문장은 앱이 만든다.
import type { FormEvent } from 'react'
import { TEXT_MAX } from '../api/unbiseoParse.ts'
import type { UnbiseoCall } from '../api/unbiseoParse.ts'
import type { UnbiseoAssistant } from '../hooks/useUnbiseoAssistant.ts'

type OpenCallOptions = { cancelOff: boolean }
type Props = { assistant: UnbiseoAssistant, onOpenCall?: (call: UnbiseoCall, options: OpenCallOptions) => void }

export default function HomeAssistantPanel({ assistant, onOpenCall }: Props) {
  const { loggedIn, text, setText, busy, answer, send, speech, callDetailOn, enabling, enableCallDetail, periodNotice, dayOff } = assistant
  const call = answer?.call

  if (!loggedIn) {
    return <p className="home-assistant-note">로그인하면 쓸 수 있습니다.</p>
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void send(text)
  }

  // 버튼 자리는 하나만 — 계약 기간 밖 → 콜 상세 꺼짐 → 휴무 → [기록하기] 순서.
  function actionFor(call: UnbiseoCall) {
    if (periodNotice) {
      return (
        <div className="home-assistant-enable" role="status">
          <p className="home-assistant-note">{periodNotice.title}</p>
          <p className="home-assistant-note">{periodNotice.body}</p>
        </div>
      )
    }
    if (!callDetailOn) {
      return (
        <div className="home-assistant-enable">
          <p className="home-assistant-note">콜 상세가 꺼져 있어요. 켤까요?</p>
          <button type="button" className="home-assistant-action" disabled={enabling} onClick={() => void enableCallDetail()}>켜기</button>
        </div>
      )
    }
    if (dayOff) {
      return (
        <div className="home-assistant-enable">
          <p className="home-assistant-note">휴무를 취소하고 운행을 기록할까요?</p>
          <button type="button" className="home-assistant-action" onClick={() => onOpenCall?.(call, { cancelOff: true })}>휴무 취소하고 기록</button>
        </div>
      )
    }
    return <button type="button" className="home-assistant-action" onClick={() => onOpenCall?.(call, { cancelOff: false })}>기록하기</button>
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
          {call && actionFor(call)}
        </div>
      )}
    </div>
  )
}
