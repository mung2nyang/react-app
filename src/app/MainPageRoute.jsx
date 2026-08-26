// Step 3 라우터 셸: `/app`(달력)와 `/app/day/:date`(일지)를 같은 MainPage 인스턴스로 그린다.
// 두 라우트가 이 컴포넌트를 그대로 재사용하므로 전환해도 언마운트되지 않고
// viewDate 등 MainPage 내부 state가 유지된다 (migration-audit-plan.md Step 3 완료 조건).
//
// Step 0-4 감사 보완: 달력 셀 클릭으로 들어왔다는 표시(location.state.from)를 남겨서,
// 일지를 닫을 때 진짜 뒤로가기(navigate(-1))와 직접 진입 시의 교체 이동을 구분한다
// (resolveWorkLogCloseTarget — workLogNavigation.js).
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import MainPage from '../components/MainPage.jsx'
import { parseDateKeySelection } from '../lib/calendar.js'
import { resolveWorkLogCloseTarget } from './workLogNavigation.js'

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
  const location = useLocation()
  const selected = parseDateKeySelection(date)

  function closeWorkLog() {
    const target = resolveWorkLogCloseTarget(location.state)
    if (target.mode === 'back') navigate(-1)
    else navigate(target.to, { replace: true })
  }

  return (
    <MainPage
      userName={userName}
      ownerKey={ownerKey}
      selected={selected}
      onSelectDay={(sel) => navigate(`/app/day/${sel.dateKey}`, { state: { from: 'calendar' } })}
      onCloseWorkLog={closeWorkLog}
      onOpenMenu={onOpenMenu}
      onOpenNotifs={onOpenNotifs}
      notifCount={notifCount}
      showToast={showToast}
      onWorkChanged={onWorkChanged}
      onBackToAuth={onBackToAuth}
    />
  )
}
