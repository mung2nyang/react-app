// 거래처 순수 계산부. 저장은 data/sync/clientsSave.js, 타입은 clientTypes.ts, 결제 주기 계산은 clientPaymentTerms.ts(여기서 재수출).
// §6 예외(~250 한도 내) — computeFixedRouteFare는 resolveFixedUnitPrice와 같은 고정노선 계산이라 옆에 둔다.
import { parseCurrencyValue } from './money.ts'
import type { ClientDraft, ClientLike } from './clientTypes.ts'

export * from './clientPaymentTerms.ts'
import { PAYMENT_TERMS, needsPaymentTermValue } from './clientPaymentTerms.ts'

export type { ClientLike }

// scopeKey를 넘기면 그 스코프(예: 연동기사 배정 차량번호) 전용 고정노선을 먼저 찾고, 없거나 안 넘기면 차주 본인(미스코프) 것을 쓴다.
export function getFixedRouteClient(settings: { clients?: Array<ClientLike> }, scopeKey?: string) {
  const list = settings.clients || []
  const key = String(scopeKey || '').trim()
  if (key) {
    const scoped = list.find((client) => client.fixedRouteLinked && client.scopedToVehicleNumber === key)
    if (scoped) return scoped
  }
  return list.find((client) => client.fixedRouteLinked && !client.scopedToVehicleNumber) || null
}

// 별도 "1회 단가" 설정은 없다 — 계정(또는 scopeKey 스코프)에서 고정노선에 연결한 거래처 1곳의
// fixedUnitPrice만 본다(settings.unitPrice는 쓰지 않는다).
export function resolveFixedUnitPrice(settings: { clients?: Array<ClientLike>, unitPrice?: number | string }, scopeKey?: string): number {
  return Math.max(0, parseCurrencyValue(getFixedRouteClient(settings, scopeKey)?.fixedUnitPrice))
}

// 고정노선 운행은 그날 기록에 금액을 안 저장하고(fixedCount만) 매번 단가×횟수로
// 계산한다(getOwnerMonthlyFinanceDetail과 같은 공식) — 기사 정산 쪽(financeCore.ts
// getMonthlyDriverTotals)도 이 공식을 재사용해야 금액이 안 빠진다.
export function computeFixedRouteFare(record: { isOff?: boolean, fixedCount?: number | string, palletCount?: number | string } | null | undefined, opts: { fixedUnitPrice: number, palletUnitPrice?: number, subFixedOn?: boolean, activePalletOn?: boolean }): number {
  if (!record || record.isOff) return 0
  const count = Math.max(0, parseInt(String(record.fixedCount), 10) || 0)
  let amount = count > 0 ? count * opts.fixedUnitPrice : 0
  const palletCount = Math.max(0, parseInt(String(record.palletCount), 10) || 0)
  if (palletCount > 0 && opts.subFixedOn && opts.activePalletOn) {
    amount += palletCount * (opts.palletUnitPrice || 0)
  }
  return amount
}

function paymentTermOf(draft: ClientDraft) {
  return PAYMENT_TERMS.some((item) => item.value === draft.paymentTerm) ? String(draft.paymentTerm) : 'next_month_end'
}

/** 저장 전 입력 검사 — 맨 처음 문제 칸과 문구, 문제 없으면 null(거래처 창 칸 표시와 upsertClient가 같이 씀). */
export function checkClientDraft(draft: ClientDraft): { field: 'companyName' | 'paymentTermValue' | 'commValue' | 'fixedUnitPrice' | 'palletPrice', message: string } | null {
  if (!String(draft.companyName || '').trim()) return { field: 'companyName', message: '거래처명을 입력해 주세요.' }
  const paymentTerm = paymentTermOf(draft)
  const paymentTermValue = String(draft.paymentTermValue || '').trim()
  if (needsPaymentTermValue(paymentTerm)) {
    const n = Number(paymentTermValue)
    if (!paymentTermValue || !Number.isFinite(n) || n < 1) return { field: 'paymentTermValue', message: '결제 주기 숫자를 입력해 주세요.' }
    if ((paymentTerm === 'next_month_day' || paymentTerm === 'second_month_day') && n > 31) {
      return { field: 'paymentTermValue', message: '날짜는 1~31 사이로 입력해 주세요.' }
    }
  }
  if (draft.commEnabled && !String(draft.commValue || '').trim()) return { field: 'commValue', message: '수수료 값을 입력해 주세요.' }
  if (draft.fixedRouteLinked && !String(draft.fixedUnitPrice ?? '').trim()) return { field: 'fixedUnitPrice', message: '고정 노선 1회 단가를 입력해 주세요.' }
  if (draft.palletOn && !String(draft.palletPrice ?? '').trim()) return { field: 'palletPrice', message: '파렛트 단가를 입력해 주세요.' }
  return null
}

export function upsertClient(clients: Array<ClientLike>, draft: ClientDraft, editingId: string | null = null) {
  const problem = checkClientDraft(draft)
  if (problem) return { error: problem.message, clients }

  const companyName = String(draft.companyName || '').trim()
  const managerName = String(draft.managerName || '').trim()
  const phone = String(draft.phone || '').trim()
  const bizNumber = String(draft.bizNumber || '').trim()
  const paymentTerm = paymentTermOf(draft)
  const paymentTermValue = String(draft.paymentTermValue || '').trim()
  const commEnabled = !!draft.commEnabled
  const commValue = String(draft.commValue || '').trim()
  const fixedRouteLinked = !!draft.fixedRouteLinked
  const fixedUnitPrice = String(draft.fixedUnitPrice ?? '').trim()
  const palletOn = !!draft.palletOn
  const palletPrice = String(draft.palletPrice ?? '').trim()

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
    commEnabled,
    commType: draft.commType === 'direct' ? 'direct' : 'percent',
    commValue: commEnabled ? commValue : '',
    fixedRouteLinked,
    fixedUnitPrice: fixedRouteLinked ? fixedUnitPrice : '',
    palletOn,
    palletPrice: palletOn ? palletPrice : '',
    ...(draft.scopedToVehicleNumber ? { scopedToVehicleNumber: String(draft.scopedToVehicleNumber).trim() } : {}),
  }
  const list = [...(clients || [])]

  if (editingId) {
    const idx = list.findIndex((client) => client.id === editingId)
    if (idx < 0) return { error: '거래처를 찾지 못했습니다.', clients }
    list[idx] = { ...list[idx], ...next }
  } else {
    list.push(({ id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...next }) as ClientLike)
  }

  const savedId = editingId || list[list.length - 1].id
  const savedScope = next.scopedToVehicleNumber || ''
  const unique = fixedRouteLinked
    ? list.map((client) => {
      if (client.id === savedId) return client
      if ((client.scopedToVehicleNumber || '') !== savedScope) return client
      return { ...client, fixedRouteLinked: false }
    })
    : list
  return { clients: sortClientsPinnedFirst(unique), id: savedId }
}

export function sortClientsPinnedFirst(clients: Array<ClientLike>) {
  const pinned: Array<ClientLike> = []
  const rest: Array<ClientLike> = []
  ;(clients || []).forEach((client) => {
    if (client?.isPinned) pinned.push(client)
    else rest.push(client)
  })
  return [...pinned, ...rest]
}

export function reorderClients(clients: Array<ClientLike>, fromId: string, toId: string) {
  const visible = (clients || []).filter((client) => !client.scopedToVehicleNumber)
  const scoped = (clients || []).filter((client) => !!client.scopedToVehicleNumber)
  const list = [...visible]
  const from = list.findIndex((client) => client.id === fromId)
  const to = list.findIndex((client) => client.id === toId)
  if (from < 0 || to < 0 || from === to) return clients || []
  if (!!list[from].isPinned !== !!list[to].isPinned) return clients || []
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return [...list, ...scoped]
}

/** 즐겨찾기 거래처. 호출 전 `getClientsForLog` 등으로 이미 scope를 좁혀서 넘길 것. */
export function pinnedClients(clients: Array<ClientLike>) {
  return (clients || []).filter((client) => client.isPinned && client.companyName)
}

/**
 * 일지(logId) 스코프에 맞는 거래처만 반환.
 * logId가 없거나 `'main'`이면 일반(미스코프) 거래처만, 아니면 해당 차량 전용만.
 */
export function getClientsForLog(clients: Array<ClientLike>, logId?: string): Array<ClientLike> {
  const list = clients || []
  const key = String(logId || '').trim()
  if (!key || key === 'main') {
    return list.filter((client) => !client.scopedToVehicleNumber)
  }
  return list.filter((client) => client.scopedToVehicleNumber === key)
}

export function removeClient(clients: Array<ClientLike>, id: string) {
  return (clients || []).filter((client) => client.id !== id)
}

export function updateClientTaxInfo(clients: Array<ClientLike>, companyName: string, patch: Partial<ClientLike>) {
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
