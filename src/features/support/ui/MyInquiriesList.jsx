// @ts-check
// 고객센터 내 문의 목록 — 답변 대기/완료 표시, 못 불러오면 알림과 빈 목록 안내.
import { useEffect, useState } from 'react'
import { fetchMyInquiries } from '../api/supportInquiryMutations.js'
import { SkeletonLines } from '../../../shared/ui/Skeleton.jsx'
import { useToast } from '../../../shared/hooks/useToast.js'

/** @typedef {import('../api/supportInquiryMutations.js').SupportInquiryRow} SupportInquiryRow */

const FETCH_FAIL_TOAST = '문의 목록을 불러오지 못했습니다.'

/**
 * @param {Object} props
 * @param {string} props.userId
 */
export default function MyInquiriesList({ userId }) {
  const showToast = useToast()
  const [items, setItems] = useState(/** @type {Array<SupportInquiryRow>} */ ([]))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMyInquiries(userId)
      .then((rows) => { if (!cancelled) setItems(rows) })
      .catch(() => {
        if (cancelled) return
        setItems([])
        showToast?.(FETCH_FAIL_TOAST)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, showToast])

  if (loading) return <SkeletonLines lines={3} label="문의 목록 불러오는 중" />
  if (!items.length) return <div className="support-panel-empty">아직 접수한 문의나 건의가 없습니다.</div>

  return (
    <div className="my-inquiries-list">
      {items.map((inquiry) => {
        const answered = !!inquiry.answer
        const dateText = inquiry.created_at
          ? new Date(inquiry.created_at).toLocaleDateString('ko-KR')
          : ''
        return (
          <div key={inquiry.id} className="my-inquiry-card">
            <div className="my-inquiry-head">
              <span className="my-inquiry-type">{inquiry.type || '문의'}</span>
              <span className={`my-inquiry-status ${answered ? 'answered' : 'pending'}`}>
                {answered ? '답변 완료' : '답변 대기'}
              </span>
            </div>
            <strong className="my-inquiry-title">{inquiry.title || ''}</strong>
            <p className="my-inquiry-content">{inquiry.content || ''}</p>
            {dateText ? <div className="my-inquiry-date">{dateText}</div> : null}
            {answered ? (
              <div className="my-inquiry-answer">
                <span className="my-inquiry-answer-label">운영자 답변</span>
                <p>{inquiry.answer}</p>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
