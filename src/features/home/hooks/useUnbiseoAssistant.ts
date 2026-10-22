// 운비서 말하기·보내기 상태 — 줄의 마이크와 늘어난 카드가 같이 쓴다(로드맵 24-B).
import { useState } from 'react'
import { isCloudSession } from '../../../data/cloud/cloudSession.ts'
import { useSession } from '../../../data/cloud/sessionContext.ts'
import { useOwnerClients, useOwnerDrivers, useOwnerSettings, useOwnerWorkData } from '../../../data/store/ownerDataHooks.ts'
import { savePracticeSettings } from '../../../data/sync/settingsSave.ts'
import { resolveLogSettings } from '../../../domain/carSettingsScope.ts'
import { todayWorkLogSelection } from '../../../domain/calendar.ts'
import { isOffDay } from '../../../domain/day-record.ts'
import { assignmentPeriodNotice } from '../../../domain/drivers.ts'
import { useToast } from '../../../shared/hooks/useToast.js'
import { SERVER_SAVE_FAIL } from '../../../shared/utils/failureMessages.js'
import { describeResult, requestUnbiseoParse } from '../api/unbiseoParse.ts'
import type { UnbiseoCall } from '../api/unbiseoParse.ts'
import useSpeechInput from './useSpeechInput.ts'

export type UnbiseoAnswer = { said: string, sentence: string, call: UnbiseoCall | null }

export default function useUnbiseoAssistant() {
  const { ownerKey, session } = useSession()
  const clients = useOwnerClients(ownerKey)
  const settings = useOwnerSettings(ownerKey)
  const showToast = useToast()
  const loggedIn = isCloudSession(session)
  const workData = useOwnerWorkData(ownerKey)
  const myLink = useOwnerDrivers(ownerKey).find((driver) => driver.status === 'linked')
  const callDetailOn = !!resolveLogSettings(settings, 'main').callDetail
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [answer, setAnswer] = useState<UnbiseoAnswer | null>(null)
  const speech = useSpeechInput((heard) => {
    setText(heard)
    void send(heard)
  })

  async function send(said: string) {
    const trimmed = said.trim()
    if (!loggedIn || busy || !trimmed) return
    const today = todayWorkLogSelection(new Date()).dateKey
    setBusy(true)
    setAnswer({ said: trimmed, sentence: '알아듣는 중…', call: null })
    const result = await requestUnbiseoParse({ text: trimmed, today, clientNames: clients.map((client) => client.companyName || '') })
    setAnswer({ said: trimmed, sentence: describeResult(result, today), call: result.kind === 'call' ? result.call : null })
    setBusy(false)
  }

  // 앱 설정 화면의 "콜 상세" 켜기와 같은 값을 저장한다.
  async function enableCallDetail() {
    if (enabling) return
    setEnabling(true)
    try {
      await savePracticeSettings(ownerKey, { callDetail: true })
    } catch (error) {
      console.error('설정 저장 실패:', error)
      showToast(SERVER_SAVE_FAIL)
    }
    setEnabling(false)
  }

  // [기록하기] 전에 일지와 같은 기준으로 계약 기간·휴무를 본다.
  const callDate = answer?.call?.date
  const periodNotice = callDate && session?.accountType === 'employed_driver' ? assignmentPeriodNotice(callDate, myLink?.startDate, myLink?.endDate) : null
  const dayOff = !!callDate && isOffDay(workData[callDate])

  return { loggedIn, text, setText, busy, answer, send, speech, callDetailOn, enabling, enableCallDetail, periodNotice, dayOff }
}

export type UnbiseoAssistant = ReturnType<typeof useUnbiseoAssistant>
