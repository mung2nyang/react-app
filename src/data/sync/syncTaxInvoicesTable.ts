// 세금계산서 upsert. 로그인 저장은 invoices 배열을 인자로 받고 Store/LS를 먼저 쓰지 않는다.
import { supabase } from '../cloud/supabaseClient.ts'
import {
  applyInsertedTaxInvoiceId,
  buildTaxInvoiceRow,
  matchTaxInvoiceClientId,
  resolveTaxInvoiceVehicleId,
  TAX_INVOICE_VEHICLE_RETRY_ERROR,
} from '../../domain/taxInvoices.ts'
import { getState } from '../store/app-store.ts'
import type { InvoiceLike } from '../../domain/financeTaxInvoiceEntries.ts'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function resolveTaxInvoiceVehicleIdWithRetry(item: InvoiceLike, ownerKey: string) {
  let vehicleId = resolveTaxInvoiceVehicleId(item, { cars: getState().cars[ownerKey] || [] })
  for (let attempt = 0; !vehicleId && attempt < 5; attempt += 1) {
    await wait(500)
    vehicleId = resolveTaxInvoiceVehicleId(item, { cars: getState().cars[ownerKey] || [] })
  }
  return vehicleId
}

export async function syncTaxInvoices(userId: string, ownerKey: string, cars: Array<CarLike>, clients: Array<ClientLike>, invoices?: Array<InvoiceLike>): Promise<Array<InvoiceLike> | undefined> {
  const list = invoices || getState().invoices[ownerKey] || []
  if (!list.length) return list
  const latestCars = cars || getState().cars[ownerKey] || []
  const latestClients = clients || getState().clients[ownerKey] || []
  let next = [...list]

  for (let index = 0; index < next.length; index += 1) {
    const item = next[index]
    let vehicleId = resolveTaxInvoiceVehicleId(item, { cars: latestCars })
    if (!vehicleId) vehicleId = await resolveTaxInvoiceVehicleIdWithRetry(item, ownerKey)
    if (!vehicleId) throw new Error(TAX_INVOICE_VEHICLE_RETRY_ERROR)

    const row = buildTaxInvoiceRow(item, {
      userId,
      vehicleId,
      clientId: matchTaxInvoiceClientId(item, latestClients),
    })

    if (item.supabaseId) {
      const { error } = await supabase.from('tax_invoices').update(row).eq('id', item.supabaseId)
      if (error) throw error
      continue
    }

    const { data, error } = await supabase.from('tax_invoices').insert(row).select('id').single()
    if (error) throw error
    next = applyInsertedTaxInvoiceId(next, item.id, data.id)
  }
  return next
}
