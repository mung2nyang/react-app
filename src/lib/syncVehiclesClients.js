// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — syncAll이 부르는 일반 동기화 큐의
// 차량/거래처 upsert. (여기는 "로컬 배열을 서버에 반영"만 한다 — 삭제는 다루지 않는다,
// 삭제는 directMutations.js + outboxFlush.js의 몫이다.)
import { supabase } from '../supabaseClient.js'
import { KEYS, buildClientRow, buildVehicleRow, keyFor, readJson, writeJson } from './cloudStorage.js'

export async function syncVehicles(userId, ownerKey) {
  const cars = readJson(keyFor(KEYS.cars, ownerKey), [])
  const next = [...cars]
  for (let index = 0; index < next.length; index += 1) {
    const car = next[index]
    const row = buildVehicleRow(userId, car, index)
    if (car.supabaseId) {
      const { error } = await supabase.from('vehicles').update(row).eq('id', car.supabaseId)
      if (error) throw error
      continue
    }
    const { data: existingRows, error: lookupError } = await supabase.from('vehicles')
      .select('id')
      .eq('user_id', userId)
      .eq('legacy_log_id', row.legacy_log_id)
    if (lookupError) throw lookupError
    const existingId = existingRows?.[0]?.id
    if (existingId) {
      const { error } = await supabase.from('vehicles').update(row).eq('id', existingId)
      if (error) throw error
      next[index] = { ...car, supabaseId: existingId }
    } else {
      const { data, error } = await supabase.from('vehicles').insert(row).select('id').single()
      if (error) throw error
      next[index] = { ...car, supabaseId: data.id }
    }
  }
  writeJson(keyFor(KEYS.cars, ownerKey), next)
  return next
}

export async function syncClients(userId, ownerKey) {
  const clients = readJson(keyFor(KEYS.clients, ownerKey), [])
  const next = [...clients]
  for (let index = 0; index < next.length; index += 1) {
    const client = next[index]
    const row = buildClientRow(userId, client, index)
    if (client.supabaseId) {
      const { error } = await supabase.from('clients').update(row).eq('id', client.supabaseId)
      if (error) throw error
      continue
    }
    const { data, error } = await supabase.from('clients').insert(row).select('id').single()
    if (error) throw error
    next[index] = { ...client, supabaseId: data.id }
  }
  writeJson(keyFor(KEYS.clients, ownerKey), next)
  return next
}
