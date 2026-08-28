// @ts-check
// Step 4 도메인 폴더 이동: clients.js의 순수 계산부. localStorage I/O(loadClients/
// saveClients)는 lib/clients.js에 남아 이 파일을 재수출한다.
// 재감사 3차(FAIL 지적 4번) — @ts-check 적용. ClientLike/ClientDraft는
// clientTypes.js가 정본이다(200줄 제한 때문에 타입만 뺐다) — day-log/dayLogTypes.js도
// 그걸 alias한다. 결제 주기/입금 예정일 계산은 clientPaymentTerms.js로 뺐고(같은
// 이유), 여기서 그대로 재수출해서 기존 `from './clients.js'` import 경로는 안 바뀐다.
import { parseCurrencyValue } from './money.js'

export * from './clientPaymentTerms.js'
import { PAYMENT_TERMS, needsPaymentTermValue } from './clientPaymentTerms.js'

/** @typedef {import('./clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('./clientTypes.js').ClientDraft} ClientDraft */

/** @param {{ clients?: Array<ClientLike> }} settings */
export function getFixedRouteClient(settings) {
  return (settings.clients || []).find((client) => client.fixedRouteLinked) || null
}

// 재감사 2차(FAIL 지적) — 달력(day-record.js/calendarBadges.js)과 매출·계산서
// (finance.js)가 "고정노선 1회 단가"를 서로 다른 소스로 계산하고 있었다: finance.js는
// getFixedRouteClient(settings)?.fixedUnitPrice만 보고(연결된 거래처가 없으면 0),
// 달력은 settings.unitPrice(독립된 "1회 단가" 설정)만 봤다 — 그 결과 같은 달의
// 달력 합계와 매출 화면 합계가 서로 다른 값을 보여줄 수 있었다(Step 5 감사가
// "문서화만 하고 통일은 Step 6에서" 미뤄 뒀던 항목). 이 함수가 유일한 계산 창구다:
// 고정노선에 실제로 연결된 거래처가 있으면 그 fixedUnitPrice를 쓰고(바닐라와 동일
// 계약 — Step 7이 그 연결 UI를 만들면 자동으로 이 경로를 탄다), 없으면(현재 이
// 앱의 대다수 사용자 상태 — 아직 Step 7 전) settings.unitPrice로 fallback한다.
/**
 * @param {{ clients?: Array<ClientLike>, unitPrice?: number|string }} settings
 * @returns {number}
 */
export function resolveFixedUnitPrice(settings) {
  const linked = parseCurrencyValue(getFixedRouteClient(settings)?.fixedUnitPrice)
  if (linked > 0) return linked
  return Math.max(0, parseCurrencyValue(settings?.unitPrice))
}

/**
 * @param {Array<ClientLike>} clients
 * @param {ClientDraft} draft
 * @param {string|null} [editingId]
 */
export function upsertClient(clients, draft, editingId = null) {
  const companyName = String(draft.companyName || '').trim()
  const managerName = String(draft.managerName || '').trim()
  const phone = String(draft.phone || '').trim()
  const bizNumber = String(draft.bizNumber || '').trim()
  const paymentTerm = PAYMENT_TERMS.some((item) => item.value === draft.paymentTerm)
    ? draft.paymentTerm
    : 'next_month_end'
  const paymentTermValue = String(draft.paymentTermValue || '').trim()

  if (!companyName) return { error: '업체명을 입력해 주세요.', clients }

  if (needsPaymentTermValue(paymentTerm)) {
    const n = Number(paymentTermValue)
    if (!paymentTermValue || !Number.isFinite(n) || n < 1) {
      return { error: '결제 주기 숫자를 입력해 주세요.', clients }
    }
    if ((paymentTerm === 'next_month_day' || paymentTerm === 'second_month_day') && n > 31) {
      return { error: '날짜는 1~31 사이로 입력해 주세요.', clients }
    }
  }

  const next = {
    companyName,
    managerName,
    phone,
    bizNumber,
    taxRepresentative: String(draft.taxRepresentative || '').trim(),
    taxEmail: String(draft.taxEmail || '').trim(),
    taxAddress: String(draft.taxAddress || '').trim(),
    taxBizType: String(draft.taxBizType || '').trim(),
    taxBizItem: String(draft.taxBizItem || '').trim(),
    isPinned: !!draft.isPinned,
    paymentTerm,
    paymentTermValue: needsPaymentTermValue(paymentTerm) ? paymentTermValue : '',
  }
  const list = [...(clients || [])]

  if (editingId) {
    const idx = list.findIndex((client) => client.id === editingId)
    if (idx < 0) return { error: '거래처를 찾지 못했습니다.', clients }
    list[idx] = { ...list[idx], ...next }
    return { clients: sortClientsPinnedFirst(list) }
  }

  list.push(/** @type {ClientLike} */ ({ id: `client-${Date.now()}`, ...next }))
  return { clients: sortClientsPinnedFirst(list) }
}

// 재감사 3차(FAIL 지적 3번) — 달력의 "1회 단가" 편집이 고정노선 연결 거래처가
// 있을 때 그 거래처의 fixedUnitPrice를 원자적으로 고치게 하는 유일한 창구.
// upsertClient의 `next`는 회사 정보 폼 필드만 만들고 fixedUnitPrice/fixedRouteLinked
// 등은 아예 건드리지 않는다(Step 7 전이라 그 폼 자체가 없다) — 그래서 upsertClient로
// 이 필드를 고치면 조용히 무시된다. 이 함수는 다른 필드는 그대로 두고 이 필드만
// 정확히 바꾼다(updateClientTaxInfo와 같은 "타겟 패치" 패턴).
/**
 * @param {Array<ClientLike>} clients
 * @param {string} clientId
 * @param {number|string} nextPrice
 */
export function updateClientFixedUnitPrice(clients, clientId, nextPrice) {
  const price = Math.max(0, parseCurrencyValue(nextPrice))
  return (clients || []).map((client) => (client.id === clientId ? { ...client, fixedUnitPrice: price } : client))
}

/** @param {Array<ClientLike>} clients */
export function sortClientsPinnedFirst(clients) {
  /** @type {Array<ClientLike>} */
  const pinned = []
  /** @type {Array<ClientLike>} */
  const rest = []
  ;(clients || []).forEach((client) => {
    if (client?.isPinned) pinned.push(client)
    else rest.push(client)
  })
  return [...pinned, ...rest]
}

/**
 * @param {Array<ClientLike>} clients
 * @param {string} fromId
 * @param {string} toId
 */
export function reorderClients(clients, fromId, toId) {
  const list = [...(clients || [])]
  const from = list.findIndex((client) => client.id === fromId)
  const to = list.findIndex((client) => client.id === toId)
  if (from < 0 || to < 0 || from === to) return list
  if (!!list[from].isPinned !== !!list[to].isPinned) return list
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return list
}

/** @param {Array<ClientLike>} clients */
export function pinnedClients(clients) {
  return (clients || []).filter((client) => client.isPinned && client.companyName && !client.scopedToVehicleNumber)
}

/**
 * @param {Array<ClientLike>} clients
 * @param {string} id
 */
export function removeClient(clients, id) {
  return (clients || []).filter((client) => client.id !== id)
}

/**
 * @param {Array<ClientLike>} clients
 * @param {string} companyName
 * @param {Partial<ClientLike>} patch
 */
export function updateClientTaxInfo(clients, companyName, patch) {
  return (clients || []).map((client) => (
    client.companyName === companyName
      ? {
        ...client,
        bizNumber: patch.bizNumber ?? client.bizNumber,
        taxRepresentative: patch.taxRepresentative ?? client.taxRepresentative,
        taxEmail: patch.taxEmail ?? client.taxEmail,
        taxAddress: patch.taxAddress ?? client.taxAddress,
        taxBizType: patch.taxBizType ?? client.taxBizType,
        taxBizItem: patch.taxBizItem ?? client.taxBizItem,
      }
      : client
  ))
}
