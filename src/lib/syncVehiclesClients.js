// @ts-check
// 차량/거래처 클라우드 upsert. 로그인 저장은 목록을 인자로 받아 Store 반영 전에 서버에
// 쓰고 remote id를 돌려준다. syncOne*(Store 조회)는 outboxFlush 레거시용.
import { supabase } from '../supabaseClient.js'
import { buildClientRow, buildVehicleRow } from './cloudStorage.js'
import { assertSessionStillCurrent, captureSession } from './cloudSession.js'
import { getState } from '../store/app-store.js'
import { mergeRemoteIdByLocalId } from './syncIdMerge.js'
import { isTombstoned } from './mutationOutbox.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */

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

/**
 * @param {string} userId @param {string} ownerKey @param {Array<CarLike>} cars
 * @param {string} localId @param {SessionCapture} captured
 * @returns {Promise<string|number|null>}
 */
export async function upsertVehicleFromList(userId, ownerKey, cars, localId, captured) {
  const car = cars.find((item) => item.id === localId)
  if (!car) return null
  const index = cars.findIndex((item) => item.id === localId)
  const row = buildVehicleRow(userId, car, index < 0 ? 0 : index)
  if (car.supabaseId) {
    const { error } = await supabase.from('vehicles').update(row).eq('id', car.supabaseId)
    assertSessionStillCurrent(captured)
    if (error) throw error
    return car.supabaseId
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
    return existingId
  }
  const { data, error } = await supabase.from('vehicles').insert(row).select('id').single()
  assertSessionStillCurrent(captured)
  if (error) throw error
  return data && data.id != null && data.id !== '' ? data.id : null
}

/** @param {string} userId @param {string} ownerKey @param {string} localId @param {SessionCapture} captured */
export async function syncOneVehicle(userId, ownerKey, localId, captured) {
  const cars = getState().cars[ownerKey] || []
  const remoteId = await upsertVehicleFromList(userId, ownerKey, cars, localId, captured)
  if (remoteId != null) mergeRemoteIdByLocalId('cars', ownerKey, localId, remoteId)
}

/** @param {string} userId @param {string} ownerKey */
export async function syncVehicles(userId, ownerKey) {
  const captured = captureSession()
  const ids = (getState().cars[ownerKey] || []).map((car) => car.id).filter(Boolean)
  for (const localId of ids) {
    await syncOneVehicle(userId, ownerKey, /** @type {string} */ (localId), captured)
  }
  return getState().cars[ownerKey] || []
}

/**
 * @param {string} userId @param {string} ownerKey @param {Array<ClientLike>} clients
 * @param {string} localId @param {SessionCapture} captured
 * @returns {Promise<string|number|null>}
 */
export async function upsertClientFromList(userId, ownerKey, clients, localId, captured) {
  const client = clients.find((item) => item.id === localId)
  if (!client) return null
  const index = clients.findIndex((item) => item.id === localId)
  const row = buildClientRow(ownerKey, client, index < 0 ? 0 : index)
  if (client.supabaseId) {
    const { error } = await supabase.from('clients').update(row).eq('id', client.supabaseId)
    assertSessionStillCurrent(captured)
    if (error) throw error
    return client.supabaseId
  }
  const { data: existingRows, error: lookupError } = await supabase.from('clients')
    .select('id')
    .eq('user_id', ownerKey)
    .eq('legacy_client_id', client.id)
  assertSessionStillCurrent(captured)
  if (lookupError) throw lookupError
  const existingId = existingRows?.[0]?.id
  if (existingId) {
    const { error } = await supabase.from('clients').update(row).eq('id', existingId)
    assertSessionStillCurrent(captured)
    if (error) throw error
    return existingId
  }
  const { data, error } = await supabase.from('clients').insert(row).select('id').single()
  assertSessionStillCurrent(captured)
  if (error) throw error
  return data?.id ?? null
}

/** @param {string} userId @param {string} ownerKey @param {string} localId @param {SessionCapture} captured */
export async function syncOneClient(userId, ownerKey, localId, captured) {
  const clients = getState().clients[ownerKey] || []
  const remoteId = await upsertClientFromList(userId, ownerKey, clients, localId, captured)
  if (remoteId != null) mergeRemoteIdByLocalId('clients', ownerKey, localId, remoteId)
}

/** @param {string} userId @param {string} ownerKey */
export async function syncClients(userId, ownerKey) {
  const captured = captureSession()
  const ids = (getState().clients[ownerKey] || []).map((client) => client.id).filter(Boolean)
  for (const localId of ids) {
    await syncOneClient(userId, ownerKey, /** @type {string} */ (localId), captured)
  }
  return getState().clients[ownerKey] || []
}
