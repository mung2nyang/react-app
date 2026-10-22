// 차량/거래처 클라우드 upsert. 로그인 저장은 목록을 인자로 받아 Store 반영 전에 서버에
// 쓰고 remote id를 돌려준다.
import { supabase } from '../cloud/supabaseClient.ts'
import { buildClientRow, buildVehicleRow } from '../cloud/cloudStorage.ts'
import { assertSessionStillCurrent } from '../cloud/cloudSession.ts'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { SessionCapture } from './syncTypes.ts'

function findExistingVehicle(rows: Array<{ id?: string | number, number?: string, type?: string, legacy_log_id?: string, raw?: { id?: string } | null }>, car: CarLike, row: { number?: string, type?: string, legacy_log_id?: string }) {
  return (rows || []).find((existing) => {
    const rawId = existing.raw && typeof existing.raw === 'object' ? existing.raw.id : undefined
    if (car.id && rawId === car.id) return true
    if (existing.legacy_log_id && existing.legacy_log_id === row.legacy_log_id) return true
    if (existing.number === row.number && existing.type === row.type) return true
    return false
  })
}

export async function upsertVehicleFromList(userId: string, ownerKey: string, cars: Array<CarLike>, localId: string, captured: SessionCapture): Promise<string | number | null> {
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
  const existing = findExistingVehicle(existingRows || [], car, row)
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

export async function upsertClientFromList(userId: string, ownerKey: string, clients: Array<ClientLike>, localId: string, captured: SessionCapture): Promise<string | number | null> {
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
