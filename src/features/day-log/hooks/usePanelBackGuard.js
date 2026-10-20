// @ts-check
// 입력 칸이 열린 동안 붙잡기 기록을 1장 쌓아, 휴대폰 뒤로가기도 ← 처럼 먼저 묻는다(로드맵 63-B).
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { panelGuardOnTop, popPanelGuardThen, takeGuardSkip } from '../../../app/historyMoves.js'
import { cancelConfirmDialog, confirmDialogOpen } from '../../../shared/ui/confirmDialog.jsx'

/**
 * @param {boolean} open 입력 칸(콜 상세·정비/주유/기타)이 열려 있나
 * @param {() => Promise<boolean>} confirmLeave true면 나가도 된다
 * @param {() => void} leave 입력 칸 닫고 ← 와 같은 곳으로
 */
export default function usePanelBackGuard(open, confirmLeave, leave) {
  const location = useLocation()
  const navigate = useNavigate()
  const pushedRef = useRef(false)
  const latest = useRef({ confirmLeave, leave, location })
  latest.current = { confirmLeave, leave, location }

  function pushGuard() {
    const { pathname, search, state } = latest.current.location
    takeGuardSkip()
    pushedRef.current = true
    navigate({ pathname, search }, { state: { ...(state && typeof state === 'object' ? state : {}), panelGuard: true } })
  }

  useEffect(() => {
    if (open && !pushedRef.current) pushGuard()
    if (!open && pushedRef.current) popPanelGuardThen(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열림이 바뀔 때만
  }, [open])

  useEffect(() => {
    if (!pushedRef.current || panelGuardOnTop()) return
    pushedRef.current = false
    if (takeGuardSkip()) return
    // 묻는 동안에도 붙잡기 기록을 먼저 다시 쌓아, 창이 뜬 채 뒤로가기는 창만 닫는다(로드맵 63-C).
    pushGuard()
    if (confirmDialogOpen()) { cancelConfirmDialog(); return }
    void latest.current.confirmLeave().then((ok) => {
      if (ok) popPanelGuardThen(() => latest.current.leave())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록(location.key)이 바뀔 때만
  }, [location.key])

  useEffect(() => () => { takeGuardSkip() }, [])
}
