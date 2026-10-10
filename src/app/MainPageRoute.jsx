// @ts-check
// 달력(`/app/calendar`, 서브 차량 `/app/logs/:logId`)과 일지(`/app/day/:date`) 라우트 묶음. 일지는 스스로 저장하므로 dateKey·ownerKey만 넘긴다.
// 달력에서 들어온 표시(location.state.from)로 일지 닫기를 뒤로가기/교체 이동 중 고른다(workLogNavigation.js).
import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CalendarPage from '../components/calendar/CalendarPage.jsx'
import DayLogPage from '../components/day-log/DayLogPage.jsx'
import { resolveLogSettings } from '../domain/carSettingsScope.js'
import { parseDateKeySelection } from '../lib/calendar.js'
import { useOwnerCars, useOwnerClients, useOwnerSettings } from '../store/ownerDataHooks.js'
import { confirmLeaveIfUnsafe } from '../lib/durableWriteGuard.js'
import { resolveWorkLogCloseTarget } from './workLogNavigation.js'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {AppSession|null} [props.session]
 * @param {string} [props.userName]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onWorkChanged]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onBackToAuth]
 */
export default function MainPageRoute({
  ownerKey,
  session,
  userName,
  showToast,
  onWorkChanged,
  onOpenMenu,
  onBackToAuth,
}) {
  const { date, logId: rawLogId } = useParams()
  const logId = rawLogId ? decodeURIComponent(rawLogId) : 'main'
  const navigate = useNavigate()
  const location = useLocation()
  const selected = parseDateKeySelection(date)
  const ownerSettings = useOwnerSettings(ownerKey)
  const settings = useMemo(() => resolveLogSettings(ownerSettings, logId), [ownerSettings, logId])
  const clients = useOwnerClients(ownerKey)
  const cars = useOwnerCars(ownerKey)
  // 연동 기사 본인 세션: workData는 항상 logId='main'이지만 거래처는 배정 차량 스코프.
  const clientScopeKey = session?.linkedOwnerId
    ? (cars[0]?.number || 'main')
    : logId
  const knownLog = logId === 'main' || cars.some((car) => car.number === logId)

  useEffect(() => {
    if (date && !selected) navigate('/app/calendar', { replace: true })
  }, [date, selected, navigate])

  useEffect(() => {
    if (rawLogId && !knownLog) navigate('/app/calendar', { replace: true })
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
        // key 필수: 날짜만 바뀌면 React가 화면을 재사용해 A 날짜 편집이 B 날짜로 저장된다.
        // key로 새로 마운트하면 옛 화면이 A 편집을 A에 저장하고 끝난다.
        key={`${ownerKey}:${logId}:${selected.dateKey}`}
        month={selected.month}
        day={selected.day}
        dateKey={selected.dateKey}
        ownerKey={ownerKey}
        logId={logId}
        clientScopeKey={clientScopeKey}
        clients={clients}
        settings={settings}
        showToast={showToast}
        onWorkChanged={onWorkChanged}
        onClose={closeWorkLog}
        onOpenMenu={onOpenMenu}
        isEmployedDriver={session?.accountType === 'employed_driver'}
      />
    )
  }

  return (
    <CalendarPage
      ownerKey={ownerKey}
      logId={logId}
      clientScopeKey={clientScopeKey}
      userName={userName}
      onOpenMenu={onOpenMenu}
      onBackToAuth={onBackToAuth}
      showToast={showToast}
      // closeWorkLog(DayLogPage 헤더 "뒤로가기")는 DayLogPage.jsx의 handleClose가
      // 이미 confirmLeaveIfUnsafe()로 감싸서 부른다 — 여기서 또 감싸면 같은 이동에
      // confirm이 두 번 뜬다. 달력→일지 진입은 그 경로가 아니라서(어디서도 아직
      // 확인 안 함) 여기서 직접 가드한다.
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
