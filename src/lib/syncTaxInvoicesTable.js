// @ts-check
// 세금계산서 upsert. 로그인 저장은 invoices 배열을 인자로 받고 Store/LS를 먼저 쓰지 않는다.
import { supabase } from '../supabaseClient.js'
import {
  applyInsertedTaxInvoiceId,
  buildTaxInvoiceRow,
  matchTaxInvoiceClientId,
  resolveTaxInvoiceVehicleId,
  TAX_INVOICE_VEHICLE_RETRY_ERROR,
} from '../domain/taxInvoices.js'
import { getState } from '../store/app-store.js'

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @param {InvoiceLike} item @param {string} ownerKey */
async function resolveTaxInvoiceVehicleIdWithRetry(item, ownerKey) {
  let vehicleId = resolveTaxInvoiceVehicleId(item, { cars: getState().cars[ownerKey] || [] })
  for (let attempt = 0; !vehicleId && attempt < 5; attempt += 1) {
    await wait(500)
    vehicleId = resolveTaxInvoiceVehicleId(item, { cars: getState().cars[ownerKey] || [] })
  }
  return vehicleId
}

/**
 * @param {string} userId @param {string} ownerKey
 * @param {Array<import('../domain/financeTypes.js').CarLike>} cars
 * @param {Array<import('../domain/clientTypes.js').ClientLike>} clients
 * @param {Array<InvoiceLike>} [invoices]
 * @returns {Promise<Array<InvoiceLike>|undefined>}
 */
export async function syncTaxInvoices(userId, ownerKey, cars, clients, invoices) {
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
