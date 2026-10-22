// 문의 카드 한 장 + 답변 쓰기·고치기 칸.
import { useState } from 'react'
import { requestAdminAnswerSave } from '../api/adminInquiries.ts'
import type { AdminInquiry } from '../api/adminInquiries.ts'
import { useToast } from '../../../shared/hooks/useToast.js'

const ANSWER_MAX = 2000

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
      <textarea
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
            {answered ? '답변 고치기' : '답변하기'}
          </button>
        </div>
      )}
    </div>
  )
}
