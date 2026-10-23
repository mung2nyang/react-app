// 운비서 대화는 앱 전체에 하나 — 홈 카드와 떠 있는 줄이 같이 쓴다(로드맵 24-B-3-B). 휴대폰에 저장하지 않는다.
import { createContext, createElement, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { UnbiseoRecord } from '../api/unbiseoParse.ts'
import useUnbiseoAssistant from './useUnbiseoAssistant.ts'
import type { UnbiseoAssistant } from './useUnbiseoAssistant.ts'

export type OpenAssistantCall = (record: UnbiseoRecord, options: { cancelOff: boolean }) => void

type UnbiseoShared = {
  assistant: UnbiseoAssistant
  /** [기록하기]·[휴무 취소하고 기록](운행·지출·고정 노선) — 떠 있는 줄을 줄이고 그 날짜 일지로 */
  openCall: OpenAssistantCall
  /** 떠 있는 줄이 펼쳐져 있나(화면을 옮겨도 그대로, 앱을 다시 켜면 줄임) */
  dockOpen: boolean
  setDockOpen: (open: boolean) => void
}

const UnbiseoContext = createContext<UnbiseoShared | null>(null)

export function UnbiseoProvider({ onOpenCall, children }: { onOpenCall: OpenAssistantCall, children?: ReactNode }) {
  const assistant = useUnbiseoAssistant()
  const [dockOpen, setDockOpen] = useState(false)
  const openCall: OpenAssistantCall = (call, options) => {
    setDockOpen(false)
    onOpenCall(call, options)
  }
  return createElement(UnbiseoContext.Provider, { value: { assistant, openCall, dockOpen, setDockOpen } }, children)
}

export function useUnbiseo(): UnbiseoShared {
  const shared = useContext(UnbiseoContext)
  if (!shared) throw new Error('UnbiseoProvider 밖에서 운비서를 불렀습니다.')
  return shared
}
