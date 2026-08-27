// @ts-check
// Step 3 라우터 셸: `/app`(달력)와 `/app/day/:date`(일지)를 한 라우트 그룹으로 묶는다.
// Step 5(달력 홈 재작성) — 달력 쪽(`selected`가 없을 때)은 CalendarPage로 분할했다
// (MainPage.jsx 폐기). 일지 쪽(WorkLogPage)은 Step 6 몫이라 이번엔 손대지 않았다 — 그
// 콜백(onCountChange 등)만 MainPage.jsx에서 그대로 옮겨 왔다.
//
// 재감사 4번: 일지 화면이 보는 workData도 로컬 스냅샷(useState(() => loadWorkData(...)))이
// 아니라 CalendarPage와 같은 store 구독 훅(useOwnerWorkData/useOwnerSettings —
// store/ownerDataHooks.js)을 쓴다 — 단일 진실 공급원. saveDay는 그 훅이 아니라
// getState()로 커밋 직전 최신값을 다시 읽어서 commit한다(React 렌더 타이밍에
// 기대지 않고, saveWorkData 호출 자체가 store를 갱신 + 구독자에게 알린다 — 별도
// setWorkData 이중 상태를 두지 않는다).
//
// Step 0-4 감사 보완: 달력 셀 클릭으로 들어왔다는 표시(location.state.from)를 남겨서,
// 일지를 닫을 때 진짜 뒤로가기(navigate(-1))와 직접 진입 시의 교체 이동을 구분한다
// (resolveWorkLogCloseTarget — workLogNavigation.js).
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CalendarPage from '../components/calendar/CalendarPage.jsx'
import { parseDateKeySelection } from '../lib/calendar.js'
import { getCallDetails, getFixedCount, isOffDay, saveDayRecord, saveWorkData } from '../lib/workData.js'
import { loadClients } from '../lib/clients.js'
import { readOwnerWorkData, useOwnerSettings, useOwnerWorkData } from '../store/ownerDataHooks.js'
import { resolveWorkLogCloseTarget } from './workLogNavigation.js'
import { TypedWorkLogPage } from './typedWorkLogPage.js'

/** @typedef {import('../domain/calendarBadges.js').DayRecordLike} DayRecordLike */
/**
 * @typedef {Object} DayPatch
 * @property {boolean} [isOff]
 * @property {number} [fixedCount]
 * @property {Array<import('../domain/calendarBadges.js').CallDetailLike>} [callDetails]
 * @property {Record<string, number>} [fixedRouteCounts]
 */

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
  const { date } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const selected = parseDateKeySelection(date)

  const workData = useOwnerWorkData(ownerKey)
  const settings = useOwnerSettings(ownerKey)

  /** @param {string} dateKey @param {DayPatch} patch */
  function saveDay(dateKey, patch) {
    // 최신 store workData를 커밋 직전에 다시 읽는다 — 위 workData(훅 결과)는 이
    // 컴포넌트가 마지막으로 렌더된 시점 값이라 이론상 한 틱 뒤처질 수 있고, 이
    // 함수는 이벤트 핸들러 안에서만 불려 React 렌더와 동기화를 보장할 수 없다.
    const latest = readOwnerWorkData(ownerKey)
    const current = latest[dateKey] || {}
    const next = saveDayRecord(latest, dateKey, {
      isOff: patch.isOff ?? isOffDay(current),
      fixedCount: patch.fixedCount ?? getFixedCount(current),
      callDetails: patch.callDetails ?? getCallDetails(current),
      fixedRouteCounts: patch.fixedRouteCounts,
    })
    saveWorkData(ownerKey, next)
    onWorkChanged?.()
  }

  function closeWorkLog() {
    const target = resolveWorkLogCloseTarget(location.state)
    if (target.mode === 'back') navigate(-1)
    else navigate(target.to, { replace: true })
  }

  if (selected) {
    /** @type {DayRecordLike|undefined} */
    const record = workData[selected.dateKey]
    return (
      <TypedWorkLogPage
        month={selected.month}
        day={selected.day}
        dateKey={selected.dateKey}
        count={getFixedCount(record)}
        isOff={isOffDay(record)}
        record={record}
        clients={loadClients(ownerKey)}
        ownerKey={ownerKey}
        settings={settings}
        showToast={showToast}
        onCountChange={(count) => saveDay(selected.dateKey, { isOff: false, fixedCount: count })}
        onOffChange={(off) => saveDay(selected.dateKey, { isOff: off, fixedCount: off ? 0 : getFixedCount(record) })}
        onCallDetailsChange={(callDetails) => saveDay(selected.dateKey, { callDetails })}
        onRouteCountsChange={(fixedRouteCounts, fixedCount) => saveDay(selected.dateKey, { isOff: false, fixedCount, fixedRouteCounts })}
        onClose={closeWorkLog}
      />
    )
  }

  return (
    <CalendarPage
      ownerKey={ownerKey}
      userName={userName}
      notifCount={notifCount}
      onOpenMenu={onOpenMenu}
      onOpenNotifs={onOpenNotifs}
      onBackToAuth={onBackToAuth}
      onSelectDay={(sel) => navigate(`/app/day/${sel.dateKey}`, { state: { from: 'calendar' } })}
    />
  )
}
