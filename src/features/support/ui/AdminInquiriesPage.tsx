// 관리자 화면 — 문의 목록·답변(로드맵 23-B). 관리자가 아니면 홈으로.
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import { SkeletonLines } from '../../../shared/ui/Skeleton.jsx'
import { useToast } from '../../../shared/hooks/useToast.js'
import { useIsAdmin } from '../../../data/cloud/adminRole.ts'
import { fetchAdminInquiries } from '../api/adminInquiries.ts'
import type { AdminInquiry } from '../api/adminInquiries.ts'
import AdminInquiryCard from './AdminInquiryCard.tsx'
import './customer-center.css'

const FETCH_FAIL_TOAST = '문의 목록을 불러오지 못했습니다.'

function AdminInquiryList() {
  const showToast = useToast()
  const [reloadKey, setReloadKey] = useState(0)
  const [items, setItems] = useState<Array<AdminInquiry> | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAdminInquiries()
      .then((rows) => { if (!cancelled) setItems(rows) })
      .catch(() => {
        if (cancelled) return
        setItems([])
        showToast(FETCH_FAIL_TOAST)
      })
    return () => { cancelled = true }
  }, [reloadKey, showToast])

  const reload = () => setReloadKey((key) => key + 1)

  if (!items) return <SkeletonLines lines={3} label="문의 목록을 불러오는 중…" />
  if (!items.length) return <div className="support-panel-empty">아직 들어온 문의가 없습니다.</div>

  const pending = items.filter((item) => !item.answer.trim()).length
  return (
    <>
      <div className="admin-inquiry-count">답변 대기 {pending}건</div>
      <div className="my-inquiries-list">
        {items.map((inquiry) => (
          <AdminInquiryCard
            key={inquiry.id}
            inquiry={inquiry}
            open={openId === inquiry.id}
            onOpen={() => setOpenId(inquiry.id)}
            onClose={() => setOpenId(null)}
            onSaved={() => { setOpenId(null); reload() }}
            onReload={reload}
          />
        ))}
      </div>
    </>
  )
}

type Props = { onBack?: () => void, onOpenMenu?: () => void }

export default function AdminInquiriesPage({ onBack, onOpenMenu }: Props) {
  const role = useIsAdmin()
  if (role === 'no') return <Navigate to="/app" replace />
  return (
    <div className="page customer-center-page">
      <PageHeader title="관리자" onBack={onBack} onOpenMenu={onOpenMenu} />
      <section className="support-panel" aria-label="문의 관리">
        <div className="support-card">
          <h3>문의 관리</h3>
        </div>
        {role === 'checking' ? <SkeletonLines lines={3} label="관리자 확인 중" /> : <AdminInquiryList />}
      </section>
    </div>
  )
}
