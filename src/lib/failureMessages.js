// @ts-check
// 원인을 아는 실패 안내 문구 — 같은 실패는 화면마다 같은 문구(로드맵 56, 보리 확정 문구 표).

/** ① 로그인 계정이 서버에 저장하다 실패 */
export const SERVER_SAVE_FAIL = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/** ② 비회원이 휴대폰(기기)에 저장하다 실패 */
export const DEVICE_SAVE_FAIL = '저장에 실패했습니다. 휴대폰 저장 공간을 확인해 주세요.'

/** ③ 저장하는 사이 로그인 정보가 바뀜 */
export const SESSION_CHANGED_FAIL = '로그인 정보가 바뀌어 저장하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.'

/**
 * 서버에 저장하던 중이면 ①, 기기에 저장하던 중이면 ②.
 * @param {boolean} onServer
 */
export function saveFailMessage(onServer) {
  return onServer ? SERVER_SAVE_FAIL : DEVICE_SAVE_FAIL
}
