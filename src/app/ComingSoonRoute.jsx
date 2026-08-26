// Step 3 라우터 셸: 바닐라의 soonTitle/soonBack(App 상태)를 쿼리 파라미터로 옮긴 자리.
// `/app/soon?title=...&back=mypage|home` — SideMenu는 항상 back=home, MyPage는 back=mypage로
// 링크한다(기존 selectMenu/openPage의 soonBack 분기와 동일).
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ComingSoonPage } from './lazyPages.js'

export default function ComingSoonRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const backTo = params.get('back') === 'mypage' ? '/app/me' : '/app'

  return <ComingSoonPage title={params.get('title') || ''} onBack={() => navigate(backTo)} />
}
