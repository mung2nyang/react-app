// @ts-check
// 여러 localStorage 키를 전부 쓰거나 하나도 안 쓴다 — 먼저 전부 직렬화하고, 쓰다 실패하면 이미 쓴 키만 되돌린다.
// 도메인 값과 dirty journal을 한 단위로 묶으려고 최종 키를 담은 { key, value } 쌍을 받는다.

/**
 * JSON.stringify로 직렬화 가능한 값 — any/unknown 대신 재귀적으로 정확히 표현한다.
 * @typedef {string|number|boolean|null|Array<JsonValue>|{[key: string]: JsonValue}} JsonValue
 */

/**
 * @typedef {Object} KeyedWrite
 * @property {string} key 실제 localStorage 키
 * @property {JsonValue} [value] 저장할 값(JSON 직렬화됨). `remove:true`이면 생략.
 * @property {boolean} [remove] true면 setItem 대신 removeItem. 실패 시 백업으로 복원.
 */

/**
 * pairs를 전부 쓰거나, 하나라도 실패하면 아무 흔적도 안 남기고 던진다.
 * @param {Array<KeyedWrite>} pairs
 */
export function writeAllOrNothing(pairs) {
  // 1) 먼저 전부 직렬화한다 — 순환 참조 등으로 하나라도 JSON.stringify에 실패하면
  //    localStorage에 아무것도 안 쓴 채로 여기서 던진다. remove 항목은 직렬화하지 않는다.
  /** @type {Array<{ key: string, remove: true, json: null } | { key: string, remove: false, json: string }>} */
  const writes = pairs.map((pair) => (
    pair.remove
      ? { key: pair.key, remove: true, json: null }
      : { key: pair.key, remove: false, json: JSON.stringify(pair.value) }
  ))

  // 2) 실제로 쓰기 전에 각 키의 "지금" 값을 백업한다 — 도중에 실패하면 이걸로 되돌린다.
  const backups = writes.map(({ key }) => /** @type {[string, string|null]} */ ([key, localStorage.getItem(key)]))
  let writtenCount = 0
  try {
    for (const write of writes) {
      if (write.remove) localStorage.removeItem(write.key)
      else localStorage.setItem(write.key, write.json)
      writtenCount += 1
    }
  } catch (error) {
    // 아직 안 쓴 나머지는 애초에 안 썼으니 되돌릴 게 없다 — 이미 쓴 것만 복원한다.
    for (let i = 0; i < writtenCount; i += 1) {
      const backup = backups[i]
      if (!backup) continue
      const [key, previous] = backup
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
    }
    throw error
  }
}
