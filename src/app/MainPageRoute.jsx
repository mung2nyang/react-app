// @ts-check
// Step 3 라우터 셸: `/app`(달력)와 `/app/day/:date`(일지)를 한 라우트 그룹으로 묶는다.
// Step 5(달력 홈 재작성) — 달력 쪽(`selected`가 없을 때)은 CalendarPage로 분할했다
// (MainPage.jsx 폐기).
// Step 6(일지 재작성) — 일지 쪽은 `DayLogPage`(WorkLogPage.jsx/InlineExpandHost.jsx
// 폐기)로 바뀌었다. `DayLogPage`는 store 구독(useDayDraft)으로 자기 workData를 직접
// 읽고 디바운스 커밋까지 스스로 하므로, 이 라우터는 이제 `record`/`count`/`isOff`/
// `saveDay` 같은 걸 더 들고 있지 않는다 — `dateKey`/`ownerKey`만 넘겨주면 된다
// (재감사 4번에서 만든 `store/ownerDataHooks.js`의 `useOwnerSettings`는 여전히
// 여기서 settings를 구독해 두 화면에 같은 값을 준다).
//
// Step 0-4 감사 보완: 달력 셀 클릭으로 들어왔다는 표시(location.state.from)를 남겨서,
// 일지를 닫을 때 진짜 뒤로가기(navigate(-1))와 직접 진입 시의 교체 이동을 구분한다
// (resolveWorkLogCloseTarget — workLogNavigation.js).
// Step 9 슬라이스 B: `/app/logs/:logId` 서브 차량 달력 + 일지 닫기 시 그 달력 복귀.
import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CalendarPage from '../components/calendar/CalendarPage.jsx'
import DayLogPage from '../components/day-log/DayLogPage.jsx'
import { parseDateKeySelection } from '../lib/calendar.js'
import { useOwnerCars, useOwnerClients, useOwnerSettings } from '../store/ownerDataHooks.js'
import { confirmLeaveIfUnsafe } from '../lib/durableWriteGuard.js'
import { resolveWorkLogCloseTarget } from './workLogNavigation.js'

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {string} [props.userName]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onWorkChanged]
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onOpenNotifs]
 * @param {(() => void)} [props.onBackToAuth]
 */
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
  const { date, logId: rawLogId } = useParams()
  const logId = rawLogId ? decodeURIComponent(rawLogId) : 'main'
  const navigate = useNavigate()
  const location = useLocation()
  const selected = parseDateKeySelection(date)
  const settings = useOwnerSettings(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const knownLog = logId === 'main' || cars.some((car) => car.number === logId)

  useEffect(() => {
    if (date && !selected) navigate('/app', { replace: true })
  }, [date, selected, navigate])

  useEffect(() => {
    if (rawLogId && !knownLog) navigate('/app', { replace: true })
  }, [rawLogId, knownLog, navigate])

  function closeWorkLog() {
    const target = resolveWorkLogCloseTarget(location.state, logId)
    if (target.mode === 'back') navigate(-1)
    else navigate(target.to, { replace: true })
  }

  if (selected) {
    if (rawLogId && !knownLog) return null
    return (
      <DayLogPage
        // 재감사 1번(FAIL 지적) — react-router는 같은 Route(`day/:date`) 안에서
        // date 파라미터만 바뀌면 MainPageRoute/DayLogPage를 언마운트하지 않고
        // 재사용한다. useDayDraft의 useReducer 초기값은 "마운트 시 한 번만" 계산되므로,
        // key 없이는 A 날짜의 draft가 B 날짜로 넘어와 그대로 남고, 이미 걸려 있던
        // 디바운스 타이머가 B의 dateKey로 A의 데이터를 커밋해 버리는 데이터 오염이
        // 생겼다(실측: 하단 "일일운행" 탭으로 과거 일지 → 오늘 날짜 직행 시 재현).
        // key를 dateKey(+ownerKey)로 주면 날짜가 바뀔 때마다 React가 이 서브트리를
        // 완전히 새로 마운트한다 — 기존(이미 실측 검증된) 언마운트 flush effect가
        // "옛 인스턴스"에서 정확히 한 번 실행돼 A의 밀린 편집을 A에 flush하고,
        // "새 인스턴스"는 B의 데이터로 완전히 새로 초기화된다.
        key={`${ownerKey}:${logId}:${selected.dateKey}`}
        month={selected.month}
        day={selected.day}
        dateKey={selected.dateKey}
        ownerKey={ownerKey}
        logId={logId}
        clients={clients}
        settings={settings}
        showToast={showToast}
        onWorkChanged={onWorkChanged}
        onClose={closeWorkLog}
        onOpenMenu={onOpenMenu}
      />
    )
  }

  return (
    <CalendarPage
      ownerKey={ownerKey}
      logId={logId}
      userName={userName}
      notifCount={notifCount}
      onOpenMenu={onOpenMenu}
      onOpenNotifs={onOpenNotifs}
      onBackToAuth={onBackToAuth}
      showToast={showToast}
      // closeWorkLog(DayLogPage 헤더 "뒤로가기")는 DayLogPage.jsx의 handleClose가
      // 이미 confirmLeaveIfUnsafe()로 감싸서 부른다 — 여기서 또 감싸면 같은 이동에
      // confirm이 두 번 뜬다. 달력→일지 진입은 그 경로가 아니라서(어디서도 아직
      // 확인 안 함) 여기서 직접 가드한다(재감사 4차 FAIL 지적 3번 — 전역 이동 경로).
      onSelectDay={(sel) => {
        if (!confirmLeaveIfUnsafe()) return
        const path = logId === 'main'
          ? `/app/day/${sel.dateKey}`
          : `/app/logs/${encodeURIComponent(logId)}/day/${sel.dateKey}`
        navigate(path, { state: { from: 'calendar' } })
      }}
    />
  )
}
