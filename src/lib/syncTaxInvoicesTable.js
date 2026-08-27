// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — syncAll이 부르는 일반 동기화 큐의
// 세금계산서 upsert.
import { supabase } from '../supabaseClient.js'
import {
  applyInsertedTaxInvoiceId,
  buildTaxInvoiceRow,
  matchTaxInvoiceClientId,
  resolveTaxInvoiceVehicleId,
  TAX_INVOICE_VEHICLE_RETRY_ERROR,
} from '../domain/taxInvoices.js'
import { KEYS, keyFor, readJson, writeJson } from './cloudStorage.js'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function resolveTaxInvoiceVehicleIdWithRetry(item, ownerKey) {
  let vehicleId = resolveTaxInvoiceVehicleId(item, { cars: readJson(keyFor(KEYS.cars, ownerKey), []) })
  for (let attempt = 0; !vehicleId && attempt < 5; attempt += 1) {
    await wait(500)
    vehicleId = resolveTaxInvoiceVehicleId(item, { cars: readJson(keyFor(KEYS.cars, ownerKey), []) })
  }
  return vehicleId
}

export async function syncTaxInvoices(userId, ownerKey, cars, clients) {
  const invoices = readJson(keyFor(KEYS.invoices, ownerKey), [])
  if (!invoices.length) return
  const latestCars = cars || readJson(keyFor(KEYS.cars, ownerKey), [])
  const latestClients = clients || readJson(keyFor(KEYS.clients, ownerKey), [])
  let next = [...invoices]

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
    writeJson(keyFor(KEYS.invoices, ownerKey), next)
  }
}
