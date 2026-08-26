import { readJsonKey } from '../store/persist.js'
import { commitClients } from '../store/app-store.js'

export const PAYMENT_TERMS = [
  { value: 'same_day', label: '당일·수시 정산' },
  { value: 'after_days', label: '운행 건별 정산 (N일 후)' },
  { value: 'next_month_day', label: '익월 지정일 정산' },
  { value: 'next_month_end', label: '익월 말일 정산' },
  { value: 'second_month_day', label: '익익월 지정일 정산' },
  { value: 'second_month_end', label: '익익월 말일 정산' },
]

export function loadClients(ownerKey = 'guest') {
  const parsed = readJsonKey('clients', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveClients(ownerKey, clients) {
  commitClients(ownerKey, clients)
}

export function needsPaymentTermValue(term) {
  return term === 'after_days' || term === 'next_month_day' || term === 'second_month_day'
}

export function getPaymentTermLabel(term, value) {
  if (term === 'next_month_end') return '익월 말일 정산'
  if (term === 'second_month_end') return '익익월 말일 정산'
  if (term === 'next_month_day') return `익월 ${value || ''}일 정산`
  if (term === 'second_month_day') return `익익월 ${value || ''}일 정산`
  if (term === 'after_days') return `운행 건별 ${value || ''}일 후 정산`
  return '당일·수시 정산'
}

export function formatDateToYmd(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calculatePaymentDueDate(workDate, paymentTerm, paymentTermValue) {
  const date = new Date(`${workDate}T00:00:00`)

  if (paymentTerm === 'next_month_end') {
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 2, 0))
  }

  if (paymentTerm === 'second_month_end') {
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 3, 0))
  }

  if (paymentTerm === 'second_month_day') {
    const selectedDay = Math.max(1, Math.min(31, parseInt(paymentTermValue, 10) || 1))
    const secondMonthLastDay = new Date(date.getFullYear(), date.getMonth() + 3, 0).getDate()
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 2, Math.min(selectedDay, secondMonthLastDay)))
  }

  if (paymentTerm === 'next_month_day') {
    const selectedDay = Math.max(1, Math.min(31, parseInt(paymentTermValue, 10) || 1))
    const nextMonthLastDay = new Date(date.getFullYear(), date.getMonth() + 2, 0).getDate()
    return formatDateToYmd(new Date(date.getFullYear(), date.getMonth() + 1, Math.min(selectedDay, nextMonthLastDay)))
  }

  if (paymentTerm === 'after_days') {
    const days = Math.max(0, parseInt(paymentTermValue, 10) || 0)
    date.setDate(date.getDate() + days)
    return formatDateToYmd(date)
  }

  return formatDateToYmd(date)
}

export function dueDateForClient(workDate, client) {
  if (!workDate) return ''
  return calculatePaymentDueDate(workDate, client?.paymentTerm || 'next_month_end', client?.paymentTermValue)
}

export function getFixedRouteClient(settings) {
  return (settings.clients || []).find((client) => client.fixedRouteLinked) || null
}

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

  list.push({ id: `client-${Date.now()}`, ...next })
  return { clients: sortClientsPinnedFirst(list) }
}

export function sortClientsPinnedFirst(clients) {
  const pinned = []
  const rest = []
  ;(clients || []).forEach((client) => {
    if (client?.isPinned) pinned.push(client)
    else rest.push(client)
  })
  return [...pinned, ...rest]
}

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

export function pinnedClients(clients) {
  return (clients || []).filter((client) => client.isPinned && client.companyName && !client.scopedToVehicleNumber)
}

export function removeClient(clients, id) {
  return (clients || []).filter((client) => client.id !== id)
}

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
