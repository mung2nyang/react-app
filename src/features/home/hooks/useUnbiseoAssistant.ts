// 운비서 말하기·보내기 상태 — 앱 틀의 unbiseoContext가 하나만 만들어 홈 카드·떠 있는 줄이 같이 쓴다(로드맵 24-B).
import { useEffect, useRef, useState } from 'react'
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
import { requestUnbiseoParse, routeNamesForAi } from '../api/unbiseoParse.ts'
import type { UnbiseoCall, UnbiseoClient, UnbiseoExpense, UnbiseoFixed } from '../api/unbiseoParse.ts'
import type { UnbiseoSms } from '../api/unbiseoSms.ts'
import { describeExistingClient, describeResult } from '../api/unbiseoSentence.ts'
import { questionNumbers } from '../api/unbiseoNumbers.ts'
import { describeQuestion } from '../api/unbiseoQuestion.ts'
import useSpeechInput from './useSpeechInput.ts'
import useSpeechOutput from './useSpeechOutput.ts'

export type UnbiseoAnswer = { said: string, sentence: string, call: UnbiseoCall | null, expense: UnbiseoExpense | null, fixed: UnbiseoFixed | null, client: UnbiseoClient | null, sms: UnbiseoSms | null }

export default function useUnbiseoAssistant() {
  const { ownerKey, session } = useSession()
  const clients = useOwnerClients(ownerKey)
  const settings = useOwnerSettings(ownerKey)
  const showToast = useToast()
  const loggedIn = isCloudSession(session)
  const isDriver = session?.accountType === 'employed_driver'
  const workData = useOwnerWorkData(ownerKey)
  const myLink = useOwnerDrivers(ownerKey).find((driver) => driver.status === 'linked')
  const mainSettings = resolveLogSettings(settings, 'main')
  const callDetailOn = !!mainSettings.callDetail
  const fixedOn = !!mainSettings.fixedOn
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [answer, setAnswer] = useState<UnbiseoAnswer | null>(null)
  // 계정이 바뀌면 대화를 비우고, 앞 계정에서 보낸 답은 버린다.
  const [answerOwner, setAnswerOwner] = useState(ownerKey)
  if (answerOwner !== ownerKey) {
    setAnswerOwner(ownerKey)
    setText('')
    setAnswer(null)
  }
  // 마이크로 말했을 때만 답을 소리로 — 듣기를 시작하면 읽던 것을 먼저 멈춘다(로드맵 24-E).
  const voice = useSpeechOutput()
  const stopSpeaking = voice.stop
  const currentOwner = useRef(ownerKey)
  useEffect(() => {
    currentOwner.current = ownerKey
    stopSpeaking()
  }, [ownerKey, stopSpeaking])
  const input = useSpeechInput((heard) => {
    setText(heard)
    void send(heard, true)
  })
  const speech = { ...input, start() { stopSpeaking(); input.start() } }

  async function send(said: string, byVoice = false) {
    const trimmed = said.trim()
    if (!loggedIn || busy || !trimmed) return
    const today = todayWorkLogSelection(new Date()).dateKey
    const owner = ownerKey
    stopSpeaking()
    setBusy(true)
    setAnswer({ said: trimmed, sentence: '알아듣는 중…', call: null, expense: null, fixed: null, client: null, sms: null })
    // 고정 노선 칩이 보이는 일지일 때만 노선 이름을 보낸다.
    const routeNames = fixedOn && mainSettings.fixedRouteOn ? routeNamesForAi(mainSettings.fixedRoutePresets || []) : []
    const result = await requestUnbiseoParse({ text: trimmed, today, clientNames: clients.map((client) => client.companyName || ''), routeNames })
    setBusy(false)
    if (owner !== currentOwner.current) return
    // 이미 있는 이름이면 등록 버튼 없이 알린다.
    const heardClient = result.kind === 'client' ? result.client : null
    const existing = !!heardClient && clients.some((client) => (client.companyName || '').trim() === heardClient.name)
    // 질문 숫자는 매출·미수금 화면과 같은 함수로, 받은 그 순간 값에서.
    const sentence = existing && heardClient ? describeExistingClient(heardClient.name) : describeResult(result, today, (question) => describeQuestion(question, today, isDriver, (asked) => questionNumbers(owner, asked, isDriver)))
    setAnswer({
      said: trimmed,
      sentence,
      call: result.kind === 'call' ? result.call : null,
      expense: result.kind === 'expense' ? result.expense : null,
      fixed: result.kind === 'fixed' ? result.fixed : null,
      client: existing ? null : heardClient,
      sms: result.kind === 'sms' ? result.sms : null,
    })
    if (byVoice) voice.speak(sentence)
  }

  // 앱 설정 화면의 "콜 상세"·"고정 노선" 켜기와 같은 값을 저장한다.
  async function enableSetting(patch: { callDetail: true } | { fixedOn: true }) {
    if (enabling) return
    setEnabling(true)
    try {
      await savePracticeSettings(ownerKey, patch)
    } catch (error) {
      console.error('설정 저장 실패:', error)
      showToast(SERVER_SAVE_FAIL)
    }
    setEnabling(false)
  }

  // [기록하기] 전에 일지와 같은 기준으로 계약 기간·휴무를 본다.
  const callDate = answer?.call?.date ?? answer?.expense?.date ?? answer?.fixed?.date
  const periodNotice = callDate && session?.accountType === 'employed_driver' ? assignmentPeriodNotice(callDate, myLink?.startDate, myLink?.endDate) : null
  const dayOff = !!callDate && isOffDay(workData[callDate])

  return { loggedIn, text, setText, busy, answer, send, speech, speaking: voice.speaking, stopSpeaking, callDetailOn, fixedOn, enabling, enableSetting, periodNotice, dayOff }
}

export type UnbiseoAssistant = ReturnType<typeof useUnbiseoAssistant>
