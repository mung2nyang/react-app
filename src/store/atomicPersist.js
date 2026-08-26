// Step 0-4 감사 보완 2차/3차 — 커밋 전 자체 교차검증(사용자 지시)에서 발견한 결함 수정.
// commitBatch가 여러 localStorage 키를 쓸 때 도중에 하나가 실패하면(용량 초과, 또는
// JSON.stringify가 순환 참조로 실패) 이미 쓴 앞쪽 키는 새 값으로 남고 뒤쪽은 그대로인
// "부분 반영" 상태가 될 수 있었다 — hydrate 조회 실패에서 없앤 것과 같은 종류의 결함이
// 쓰기 경로에 남아 있었다. 이 함수는 (1) 먼저 전부 직렬화해서 순환 참조 등은 아무것도
// 쓰기 전에 막고, (2) 실제 setItem 도중 실패하면 이미 쓴 키만 원래 값으로 되돌린다.
//
// 3차 보완: 도메인 값과 dirty journal 값을 "하나의" all-or-nothing 단위로 묶어야 해서
// (domain, ownerKey) 대신 최종 localStorage key를 직접 받는 { key, value } 쌍으로
// 바꿨다 — journal 키(reactPracticeDirtyJournal:<owner>)는 persist.js의 9개 도메인
// 계약 밖이라 storageKeyFor로 못 만든다. 호출부(app-store.js)가 도메인 쪽은
// storageKeyFor로, journal 쪽은 dirtyJournal.js의 planDirtyWrite로 key를 만들어 같은
// 배열에 담아 넘긴다.

/**
 * @typedef {Object} KeyedWrite
 * @property {string} key 실제 localStorage 키
 * @property {*} value 저장할 값(JSON 직렬화됨)
 */

/**
 * pairs를 전부 쓰거나, 하나라도 실패하면 아무 흔적도 안 남기고 던진다.
 * @param {Array<KeyedWrite>} pairs
 */
export function writeAllOrNothing(pairs) {
  // 1) 먼저 전부 직렬화한다 — 순환 참조 등으로 하나라도 JSON.stringify에 실패하면
  //    localStorage에 아무것도 안 쓴 채로 여기서 던진다.
  const writes = pairs.map(({ key, value }) => ({ key, json: JSON.stringify(value) }))

  // 2) 실제로 쓰기 전에 각 키의 "지금" 값을 백업한다 — 도중에 실패하면 이걸로 되돌린다.
  const backups = writes.map(({ key }) => [key, localStorage.getItem(key)])
  let writtenCount = 0
  try {
    for (const { key, json } of writes) {
      localStorage.setItem(key, json)
      writtenCount += 1
    }
  } catch (error) {
    // 아직 안 쓴 나머지는 애초에 안 썼으니 되돌릴 게 없다 — 이미 쓴 것만 복원한다.
    for (let i = 0; i < writtenCount; i += 1) {
      const [key, previous] = backups[i]
      if (previous === null) localStorage.removeItem(key)
      else localStorage.setItem(key, previous)
    }
    throw error
  }
}
