// @ts-check
// 고객센터 1:1 문의 작성 칸 — 접수하면 알림, 성공이면 칸을 비운다.
import { useState } from 'react'
import { requestSupportInquirySave } from '../api/supportInquiryMutations.js'
import AppDropdown from '../../../shared/ui/AppDropdown.jsx'
import ClearableInput from '../../../shared/ui/ClearableInput.jsx'
import { useToast } from '../../../shared/hooks/useToast.js'

const INQUIRY_TYPES = ['문의', '기능 건의', '오류 신고']

/**
 * @param {Object} props
 * @param {string} props.userId
 */
export default function InquiryForm({ userId }) {
  const showToast = useToast()
  const [type, setType] = useState(INQUIRY_TYPES[0])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const result = await requestSupportInquirySave({
      userId,
      type,
      title: title.trim(),
      content: content.trim(),
    })
    setBusy(false)
    showToast?.(result.toast)
    if (!result.ok) return
    setType(INQUIRY_TYPES[0])
    setTitle('')
    setContent('')
  }

  return (
    <form className="inquiry-form" onSubmit={onSubmit}>
      <label>
        문의 유형
        <AppDropdown
          label="문의 유형"
          value={type}
          options={INQUIRY_TYPES.map((option) => ({ value: option, label: option }))}
          onChange={setType}
          className="app-dropdown-boxed"
        />
      </label>
      <label>
        제목
        <ClearableInput className="input-box" maxLength={50} placeholder="제목을 입력해 주세요" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        내용
        <textarea className="input-box" rows={6} maxLength={1000} placeholder="문의 내용을 자세히 입력해 주세요" value={content} onChange={(e) => setContent(e.target.value)} required />
      </label>
      <button className="personal-account-btn" type="submit" disabled={busy}>문의 접수하기</button>
    </form>
  )
}
