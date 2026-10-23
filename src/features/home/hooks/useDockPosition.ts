// 운비서 버튼 위치(왼쪽·오른쪽, 아래 메뉴에서 띄운 높이) — 이 휴대폰에만 저장한다.
import { useRef, useState } from 'react'
import { useDrag } from '@use-gesture/react'

export type DockPosition = { side: 'left' | 'right', lift: number }
type Box = { left: number, right: number, top: number, bottom: number }

const STORAGE_KEY = 'drivelogUnbiseoDockPosition'
const DEFAULT: DockPosition = { side: 'right', lift: 0 }
const FAB_GAP = 8 // 아래 메뉴와 동그라미 사이(unbiseo-dock.css 아래 padding)
const TOP_GAP = 12
const DRAG_CLICK_MS = 400

/** 저장 값 검사 — 틀리면 기본 자리 */
export function toDockPosition(raw: string | null): DockPosition {
  if (!raw) return DEFAULT
  try {
    const value: { side?: string, lift?: number } | null = JSON.parse(raw)
    if (!value || (value.side !== 'left' && value.side !== 'right')) return DEFAULT
    if (typeof value.lift !== 'number' || !Number.isFinite(value.lift) || value.lift < 0) return DEFAULT
    return { side: value.side, lift: value.lift }
  } catch {
    return DEFAULT
  }
}

/** 놓은 동그라미(fab)와 떠 있는 자리 틀(dock) → 가까운 가장자리, 놓은 높이(아래 메뉴 위 ~ 화면 위 12px 안) */
export function snapDockPosition(fab: Box, dock: Box): DockPosition {
  const side = (fab.left + fab.right) / 2 < (dock.left + dock.right) / 2 ? 'left' : 'right'
  const floor = dock.bottom - FAB_GAP
  const maxLift = Math.max(0, floor - (fab.bottom - fab.top) - TOP_GAP)
  const lift = Math.round(Math.min(maxLift, Math.max(0, floor - fab.bottom)))
  return { side, lift }
}

function readSaved(): DockPosition {
  try {
    return toDockPosition(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT
  }
}

function save(position: DockPosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
  } catch {
    /* 저장 못 하면 이번만 그 자리 */
  }
}

/** 동그라미에 붙일 끌기와, 끈 직후 누르기를 무시하는 확인 */
export function useDockPosition() {
  const [position, setPosition] = useState(readSaved)
  const [offset, setOffset] = useState<[number, number] | null>(null)
  const fabRef = useRef<HTMLButtonElement | null>(null)
  const draggedAt = useRef(0)

  const bind = useDrag(({ last, tap, movement: [x, y] }) => {
    if (!last) {
      setOffset([x, y])
      return
    }
    const fab = fabRef.current
    const dock = fab?.closest('.unbiseo-dock')
    setOffset(null)
    if (tap || !fab || !dock) return
    draggedAt.current = Date.now()
    const next = snapDockPosition(fab.getBoundingClientRect(), dock.getBoundingClientRect())
    setPosition(next)
    save(next)
  }, { filterTaps: true })

  /** 끌고 놓은 바로 뒤 따라오는 누르기면 true */
  function justDragged() {
    return Date.now() - draggedAt.current < DRAG_CLICK_MS
  }

  return { position, offset, fabRef, bind, justDragged }
}
