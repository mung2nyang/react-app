// 마이페이지 "관리자" 줄 — 관리자 계정에만 보인다.
import { useIsAdmin } from '../../../data/cloud/adminRole.ts'

type Props = { onOpen: (page: string) => void }

export default function AdminEntryLink({ onOpen }: Props) {
  const role = useIsAdmin()
  if (role !== 'admin') return null
  return (
    <button type="button" className="mypage-notice-link" onClick={() => onOpen('admin')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <span>관리자</span>
    </button>
  )
}
