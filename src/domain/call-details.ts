// 콜상세(callDetails[]) 한 건을 만들고 배열에 upsert/제거하는 순수 함수.
import { parseCurrencyValue } from './money.ts'
import { generateLocalId } from './localId.ts'
import type { CallDetailLike } from './callDetail.ts'
import type { ClientLike } from './clients.ts'

/** buildCallDetail이 받는 폼 입력값 — 아직 정규화 전이라 전부 느슨한 문자열이다. */
export type CallDetailDraft = {
  loadLoc?: string
  unloadLoc?: string
  fare?: string | number
  client?: string
  startOdometer?: string
  endOdometer?: string
  distanceKm?: string
  remarks?: string
  vatExempt?: boolean
  paymentDueDate?: string
  departureTime?: string
  arrivalTime?: string
  platform?: string
  cargoTonnage?: string
  receipt?: string
  insuranceFee?: string
}

/** 저장 전 검사 — 운임·상차지·하차지가 모두 비면 상차지 칸에 표시한다. */
export function checkCallDetailDraft(draft: CallDetailDraft): { field: 'loadLoc', message: string } | null {
  const filled = [draft.fare, draft.loadLoc, draft.unloadLoc].some((value) => String(value ?? '').trim())
  return filled ? null : { field: 'loadLoc', message: '운임, 상차지, 하차지 중 하나를 입력해 주세요.' }
}

export function buildCallDetail(draft: CallDetailDraft, existing?: CallDetailLike | null, dateKey?: string, clients: Array<ClientLike> = []) {
  const loadLoc = String(draft.loadLoc || '').trim()
  const unloadLoc = String(draft.unloadLoc || '').trim()
  const fareInput = String(draft.fare ?? '').trim()
  const client = String(draft.client || '').trim()
  const problem = checkCallDetailDraft(draft)
  if (problem) return { error: problem.message }

  const matchedClient = (clients || []).find((item) => item.companyName === client)
  const commissionSnapshot = (matchedClient && matchedClient.commEnabled)
    ? { enabled: true, type: matchedClient.commType, value: matchedClient.commValue }
    : { enabled: false, type: null, value: null }

  const startOdometer = String(draft.startOdometer ?? existing?.startOdometer ?? '').trim()
  const endOdometer = String(draft.endOdometer ?? existing?.endOdometer ?? '').trim()
  const distanceKm = computeDistanceKm(startOdometer, endOdometer, draft.distanceKm ?? existing?.distanceKm)

  return {
    item: ({
      // 기존 항목은 id를 이어받고, 없거나 임시 "legacy-N"(배열 순서 기반)이면 영구 id를 새로 붙인다.
      id: existing?.id && !String(existing.id).startsWith('legacy-') ? existing.id : generateLocalId('trp'),
      loadLoc,
      unloadLoc,
      fare: fareInput,
      client,
      clientId: matchedClient?.id || null,
      commissionSnapshot,
      remarks: String(draft.remarks || '').trim(),
      vatExempt: !!draft.vatExempt,
      paymentStatus: existing?.paymentStatus || '미수',
      payments: Array.isArray(existing?.payments) ? existing.payments : [],
      paymentDueDate: String(draft.paymentDueDate || '').trim(),
      workDate: dateKey,
      distanceType: existing?.distanceType || '',
      linkedLoadIndex: existing?.linkedLoadIndex,
      departureTime: String(draft.departureTime ?? existing?.departureTime ?? '').trim(),
      arrivalTime: String(draft.arrivalTime ?? existing?.arrivalTime ?? '').trim(),
      platform: String(draft.platform ?? existing?.platform ?? '').trim(),
      cargoTonnage: String(draft.cargoTonnage ?? existing?.cargoTonnage ?? '').trim(),
      receipt: String(draft.receipt ?? existing?.receipt ?? '').trim(),
      insuranceFee: String(draft.insuranceFee ?? existing?.insuranceFee ?? '').trim(),
      startOdometer,
      endOdometer,
      distanceKm,
    }) as CallDetailLike,
  }
}

export function computeDistanceKm(startOdometer?: string, endOdometer?: string, fallback = '') {
  const startRaw = String(startOdometer || '').trim()
  const endRaw = String(endOdometer || '').trim()
  if (startRaw && endRaw) {
    const start = parseCurrencyValue(startRaw)
    const end = parseCurrencyValue(endRaw)
    return end >= start ? String(end - start) : ''
  }
  return String(fallback || '').trim()
}

export function upsertCallDetail(details: Array<CallDetailLike>, draft: CallDetailDraft, editingIndex: number, dateKey?: string, clients: Array<ClientLike> = []) {
  const list = [...(details || [])]
  const existing = editingIndex >= 0 ? list[editingIndex] : null
  const result = buildCallDetail(draft, existing, dateKey, clients)
  if (result.error) return { error: result.error, items: details }

  if (editingIndex >= 0) {
    if (!existing) return { error: '세부 입력을 찾지 못했습니다.', items: details }
    list[editingIndex] = result.item as CallDetailLike
    return { items: list }
  }

  list.push(result.item as CallDetailLike)
  return { items: list }
}

export function removeCallDetail(details: Array<CallDetailLike>, index: number) {
  return (details || []).filter((_, i) => i !== index)
}

// 콜 상세 산재보험료(1인 차주가 건마다 적는 칸) 하루 합 — 하루 화면·달력·내역서가 같이 쓴다(로드맵 40, 모든 화면에서 뺀다).
export function callInsuranceTotal(record: { isOff?: boolean, callDetails?: Array<CallDetailLike> } | null | undefined) {
  if (!record || record.isOff || !Array.isArray(record.callDetails)) return 0
  return record.callDetails.reduce((sum, detail) => sum + parseCurrencyValue(detail?.insuranceFee), 0)
}
