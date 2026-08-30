// @ts-check
// 차량/거래처 클라우드 upsert. 원격 응답의 id만 현재 Store 항목에 병합한다.
import { supabase } from '../supabaseClient.js'
import { buildClientRow, buildVehicleRow } from './cloudStorage.js'
import { assertSessionStillCurrent, captureSession } from './cloudSession.js'
import { getState } from '../store/app-store.js'
import { mergeRemoteIdByLocalId } from './syncIdMerge.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

import { isTombstoned } from './mutationOutbox.js'

/**
 * @param {string} ownerKey
 * @param {Array<{ id?: string|number, number?: string, type?: string, legacy_log_id?: string, raw?: { id?: string }|null }>} rows
 * @param {CarLike} car
 * @param {{ number?: string, type?: string, legacy_log_id?: string }} row
 */
function findExistingVehicle(ownerKey, rows, car, row) {
  return (rows || []).find((existing) => {
    const existingId = existing.id != null && existing.id !== '' ? String(existing.id) : ''
    if (existingId && isTombstoned(ownerKey, 'vehicle', existingId)) return false
    const rawId = existing.raw && typeof existing.raw === 'object' ? existing.raw.id : undefined
    if (car.id && rawId === car.id) return true
    if (existing.legacy_log_id && existing.legacy_log_id === row.legacy_log_id) return true
    if (existing.number === row.number && existing.type === row.type) return true
    return false
  })
}

/** @param {string} userId @param {string} ownerKey */
export async function syncVehicles(userId, ownerKey) {
  const captured = captureSession()
  /** @type {Array<string>} */
  const ids = []
  for (const car of getState().cars[ownerKey] || []) {
    if (car.id) ids.push(car.id)
  }
  for (const localId of ids) {
    const cars = getState().cars[ownerKey] || []
    const car = cars.find((item) => item.id === localId)
    if (!car) continue
    const index = cars.findIndex((item) => item.id === localId)
    const row = buildVehicleRow(userId, car, index < 0 ? 0 : index)
    if (car.supabaseId) {
      const { error } = await supabase.from('vehicles').update(row).eq('id', car.supabaseId)
      assertSessionStillCurrent(captured)
      if (error) throw error
      continue
    }
    const { data: existingRows, error: lookupError } = await supabase.from('vehicles')
      .select('id, number, type, raw, legacy_log_id')
      .eq('user_id', userId)
    assertSessionStillCurrent(captured)
    if (lookupError) throw lookupError
    const existing = findExistingVehicle(ownerKey, existingRows || [], car, row)
    const existingId = existing && existing.id
    if (existingId != null && existingId !== '') {
      const { error } = await supabase.from('vehicles').update(row).eq('id', existingId)
      assertSessionStillCurrent(captured)
      if (error) throw error
      mergeRemoteIdByLocalId('cars', ownerKey, localId, existingId)
      continue
    }
    const { data, error } = await supabase.from('vehicles').insert(row).select('id').single()
    assertSessionStillCurrent(captured)
    if (error) throw error
    const insertedId = data && data.id
    if (insertedId != null && insertedId !== '') mergeRemoteIdByLocalId('cars', ownerKey, localId, insertedId)
  }
  return getState().cars[ownerKey] || []
}

/** @param {string} userId @param {string} ownerKey */
export async function syncClients(userId, ownerKey) {
  const captured = captureSession()
  const ids = (getState().clients[ownerKey] || []).map((client) => client.id).filter(Boolean)
  for (const localId of ids) {
    const clients = getState().clients[ownerKey] || []
    const client = clients.find((item) => item.id === localId)
    if (!client) continue
    const index = clients.findIndex((item) => item.id === localId)
    const row = buildClientRow(userId, client, index < 0 ? 0 : index)
    if (client.supabaseId) {
      const { error } = await supabase.from('clients').update(row).eq('id', client.supabaseId)
      assertSessionStillCurrent(captured)
      if (error) throw error
      continue
    }
    const { data: existingRows, error: lookupError } = await supabase.from('clients')
      .select('id')
      .eq('user_id', userId)
      .eq('legacy_client_id', client.id)
    assertSessionStillCurrent(captured)
    if (lookupError) throw lookupError
    const existingId = existingRows?.[0]?.id
    if (existingId) {
      const { error } = await supabase.from('clients').update(row).eq('id', existingId)
      assertSessionStillCurrent(captured)
      if (error) throw error
      mergeRemoteIdByLocalId('clients', ownerKey, localId, existingId)
      continue
    }
    const { data, error } = await supabase.from('clients').insert(row).select('id').single()
    assertSessionStillCurrent(captured)
    if (error) throw error
    if (data?.id) mergeRemoteIdByLocalId('clients', ownerKey, localId, data.id)
  }
  return getState().clients[ownerKey] || []
}
