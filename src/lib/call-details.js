// 콜상세(callDetails[]) 한 건을 만들고 배열에 upsert/제거하는 순수 함수.
// migration-plan.md 3.4 "innerHTML + 인라인 onclick → 리스트 컴포넌트"가 참조하는
// 자리 — Step 4에서 domain/으로 옮길 때까지는 workData.js에서 분리된 파일로 유지한다.
import { parseCurrencyValue } from './money.js'

export function buildCallDetail(draft, existing, dateKey, clients = []) {
  const loadLoc = String(draft.loadLoc || '').trim()
  const unloadLoc = String(draft.unloadLoc || '').trim()
  const fareInput = String(draft.fare ?? '').trim()
  const client = String(draft.client || '').trim()
  if (!fareInput && !loadLoc && !unloadLoc) {
    return { error: '운임 또는 상·하차지 중 하나를 입력해 주세요.' }
  }

  const matchedClient = (clients || []).find((item) => item.companyName === client)
  const commissionSnapshot = (matchedClient && matchedClient.commEnabled)
    ? { enabled: true, type: matchedClient.commType, value: matchedClient.commValue }
    : { enabled: false, type: null, value: null }

  const startOdometer = String(draft.startOdometer ?? existing?.startOdometer ?? '').trim()
  const endOdometer = String(draft.endOdometer ?? existing?.endOdometer ?? '').trim()
  const distanceKm = computeDistanceKm(startOdometer, endOdometer, draft.distanceKm ?? existing?.distanceKm)

  return {
    item: {
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
      startOdometer,
      endOdometer,
      distanceKm,
    },
  }
}

export function computeDistanceKm(startOdometer, endOdometer, fallback = '') {
  const startRaw = String(startOdometer || '').trim()
  const endRaw = String(endOdometer || '').trim()
  if (startRaw && endRaw) {
    const start = parseCurrencyValue(startRaw)
    const end = parseCurrencyValue(endRaw)
    return end >= start ? String(end - start) : ''
  }
  return String(fallback || '').trim()
}

export function upsertCallDetail(details, draft, editingIndex, dateKey, clients = []) {
  const list = [...(details || [])]
  const existing = editingIndex >= 0 ? list[editingIndex] : null
  const result = buildCallDetail(draft, existing, dateKey, clients)
  if (result.error) return { error: result.error, items: details }

  if (editingIndex >= 0) {
    if (!existing) return { error: '세부 입력을 찾지 못했습니다.', items: details }
    list[editingIndex] = result.item
    return { items: list }
  }

  list.push(result.item)
  return { items: list }
}

export function removeCallDetail(details, index) {
  return (details || []).filter((_, i) => i !== index)
}
