// @ts-check
// 콜상세(callDetails[]) 한 건을 만들고 배열에 upsert/제거하는 순수 함수.
// migration-plan.md 3.4 "innerHTML + 인라인 onclick → 리스트 컴포넌트"가 참조하는
// 자리 — Step 4에서 domain/으로 옮길 때까지는 workData.js에서 분리된 파일로 유지한다.
// 재감사 3차(FAIL 지적 4번) — 이번 diff가 건드린 프로덕션 JS 전체를 활성 typecheck
// 대상으로 만들라는 지시로 @ts-check를 붙였다.
import { parseCurrencyValue } from './money.js'
import { generateLocalId } from './payments.js'

/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./clients.js').ClientLike} ClientLike */

/**
 * buildCallDetail이 받는 폼 입력값 — 아직 정규화 전이라 전부 느슨한 문자열이다.
 * @typedef {Object} CallDetailDraft
 * @property {string} [loadLoc]
 * @property {string} [unloadLoc]
 * @property {string|number} [fare]
 * @property {string} [client]
 * @property {string} [startOdometer]
 * @property {string} [endOdometer]
 * @property {string} [distanceKm]
 * @property {string} [remarks]
 * @property {boolean} [vatExempt]
 * @property {string} [paymentDueDate]
 * @property {string} [departureTime]
 * @property {string} [arrivalTime]
 * @property {string} [platform]
 * @property {string} [cargoTonnage]
 * @property {string} [receipt]
 */

/**
 * @param {CallDetailDraft} draft
 * @param {CallDetailLike|null} [existing]
 * @param {string} [dateKey]
 * @param {Array<ClientLike>} [clients]
 */
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
    item: /** @type {CallDetailLike} */ ({
      // Step 6(일지 재작성) — 콜상세 id 부여: 기존 항목은 id를 그대로 이어받고
      // (레거시라 아직 없으면 여기서 진짜 id를 새로 붙인다 — day-record.js의
      // getCallDetails가 읽을 때 임시로 채워 주는 "legacy-N"은 배열 인덱스 기반이라
      // 편집·삭제로 목록 순서가 바뀌면 안정적이지 않다 — 실제로 손을 댄 항목은
      // 여기서 영구적인 id로 바뀐다), 신규 항목은 새로 만든다.
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
      startOdometer,
      endOdometer,
      distanceKm,
    }),
  }
}

/**
 * @param {string} [startOdometer]
 * @param {string} [endOdometer]
 * @param {string} [fallback]
 */
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

/**
 * @param {Array<CallDetailLike>} details
 * @param {CallDetailDraft} draft
 * @param {number} editingIndex
 * @param {string} [dateKey]
 * @param {Array<ClientLike>} [clients]
 */
export function upsertCallDetail(details, draft, editingIndex, dateKey, clients = []) {
  const list = [...(details || [])]
  const existing = editingIndex >= 0 ? list[editingIndex] : null
  const result = buildCallDetail(draft, existing, dateKey, clients)
  if (result.error) return { error: result.error, items: details }

  if (editingIndex >= 0) {
    if (!existing) return { error: '세부 입력을 찾지 못했습니다.', items: details }
    list[editingIndex] = /** @type {CallDetailLike} */ (result.item)
    return { items: list }
  }

  list.push(/** @type {CallDetailLike} */ (result.item))
  return { items: list }
}

/**
 * @param {Array<CallDetailLike>} details
 * @param {number} index
 */
export function removeCallDetail(details, index) {
  return (details || []).filter((_, i) => i !== index)
}
