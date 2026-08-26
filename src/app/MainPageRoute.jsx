// Step 3 라우터 셸: `/app`(달력)와 `/app/day/:date`(일지)를 같은 MainPage 인스턴스로 그린다.
// 두 라우트가 이 컴포넌트를 그대로 재사용하므로 전환해도 언마운트되지 않고
// viewDate 등 MainPage 내부 state가 유지된다 (migration-audit-plan.md Step 3 완료 조건).
import { useNavigate, useParams } from 'react-router-dom'
import MainPage from '../components/MainPage.jsx'
import { parseDateKeySelection } from '../lib/calendar.js'

export default function MainPageRoute({
  ownerKey,
  userName,
  showToast,
  onWorkChanged,
  notifCount,
  onOpenMenu,
  onOpenNotifs,
  onBackToAuth,
}) {
  const { date } = useParams()
  const navigate = useNavigate()
  const selected = parseDateKeySelection(date)

  return (
    <MainPage
      userName={userName}
      ownerKey={ownerKey}
      selected={selected}
      onSelectDay={(sel) => navigate(`/app/day/${sel.dateKey}`)}
      onCloseWorkLog={() => navigate('/app')}
      onOpenMenu={onOpenMenu}
      onOpenNotifs={onOpenNotifs}
      notifCount={notifCount}
      showToast={showToast}
      onWorkChanged={onWorkChanged}
      onBackToAuth={onBackToAuth}
    />
  )
}
