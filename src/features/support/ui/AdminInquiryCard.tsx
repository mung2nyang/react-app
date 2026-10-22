// 문의 카드 한 장 + 답변 쓰기·고치기 칸.
import { useLayoutEffect, useRef, useState } from 'react'
import { requestAdminAnswerSave } from '../api/adminInquiries.ts'
import type { AdminInquiry } from '../api/adminInquiries.ts'
import { useToast } from '../../../shared/hooks/useToast.js'
import AnswerTemplateButtons from './AnswerTemplateButtons.tsx'

const ANSWER_MAX = 2000
const TOO_LONG_TOAST = '답변은 2000자까지 쓸 수 있습니다.'

// 문구는 글 끝에 붙인다(글이 있으면 줄바꿈). 2000자를 넘으면 넣지 않는다.
function appendTemplate(draft: string, text: string): string | null {
  const next = !draft ? text : draft.endsWith('\n') ? `${draft}${text}` : `${draft}\n${text}`
  return next.length > ANSWER_MAX ? null : next
}

function dateTimeText(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return `${date.toLocaleDateString('ko-KR')} ${time}`
}

type EditorProps = {
  inquiry: AdminInquiry
  onClose: () => void
  onSaved: () => void
  onReload: () => void
}

function AnswerEditor({ inquiry, onClose, onSaved, onReload }: EditorProps) {
  const showToast = useToast()
  const [draft, setDraft] = useState(inquiry.answer)
  const [busy, setBusy] = useState(false)
  const blank = !draft.trim()
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const moveCursorRef = useRef(false)

  // 문구를 넣은 뒤 글 칸에 커서를 맨 끝으로 둔다.
  useLayoutEffect(() => {
    const area = areaRef.current
    if (!moveCursorRef.current || !area) return
    moveCursorRef.current = false
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
  }, [draft])

  function pickTemplate(text: string) {
    const next = appendTemplate(draft, text)
    if (next === null) { showToast(TOO_LONG_TOAST); return }
    moveCursorRef.current = true
    setDraft(next)
  }

  async function save() {
    if (busy || blank) return
    setBusy(true)
    const result = await requestAdminAnswerSave(inquiry.id, draft)
    setBusy(false)
    showToast(result.toast)
    if (result.ok) onSaved()
    else if (result.reload) onReload()
  }

  return (
    <div className="admin-inquiry-editor">
      <AnswerTemplateButtons disabled={busy} onPick={pickTemplate} />
      <textarea
        ref={areaRef}
        className="input-box admin-inquiry-textarea"
        rows={5}
        maxLength={ANSWER_MAX}
        aria-label="답변 내용"
        placeholder="답변을 입력해 주세요"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="admin-inquiry-actions">
        <button type="button" className="admin-inquiry-btn" disabled={busy} onClick={onClose}>취소</button>
        <button type="button" className="admin-inquiry-btn primary" disabled={busy || blank} onClick={() => { void save() }}>저장</button>
      </div>
    </div>
  )
}

type CardProps = {
  inquiry: AdminInquiry
  open: boolean
  onOpen: () => void
  onClose: () => void
  onSaved: () => void
  onReload: () => void
}

export default function AdminInquiryCard({ inquiry, open, onOpen, onClose, onSaved, onReload }: CardProps) {
  const answered = !!inquiry.answer.trim()
  const createdText = dateTimeText(inquiry.createdAt)
  const answeredText = dateTimeText(inquiry.answeredAt)
  return (
    <div className="my-inquiry-card admin-inquiry-card">
      <div className="my-inquiry-head">
        <span className="my-inquiry-type">{inquiry.type || '문의'}</span>
        <span className={`my-inquiry-status ${answered ? 'answered' : 'pending'}`}>
          {answered ? '답변 완료' : '답변 대기'}
        </span>
      </div>
      <strong className="my-inquiry-title">{inquiry.title}</strong>
      <p className="my-inquiry-content">{inquiry.content}</p>
      <div className="admin-inquiry-meta">
        <span className="admin-inquiry-name">{inquiry.userName || '이름 없음'}</span>
        {createdText ? <span>{createdText}</span> : null}
      </div>
      {answered ? (
        <div className="my-inquiry-answer">
          <span className="my-inquiry-answer-label">운영자 답변</span>
          <p>{inquiry.answer}</p>
          {answeredText ? <div className="my-inquiry-date">{answeredText}</div> : null}
        </div>
      ) : null}
      {open ? (
        <AnswerEditor inquiry={inquiry} onClose={onClose} onSaved={onSaved} onReload={onReload} />
      ) : (
        <div className="admin-inquiry-actions">
          <button type="button" className="admin-inquiry-btn primary" onClick={onOpen}>
            {answered ? '답변 수정' : '답변하기'}
          </button>
        </div>
      )}
    </div>
  )
}
