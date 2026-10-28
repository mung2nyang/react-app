// @ts-check
// 원인을 아는 실패 안내 문구 — 같은 실패는 화면마다 같은 문구(로드맵 56, 보리 확정 문구 표).

/** ① 로그인 계정이 서버에 저장하다 실패 */
export const SERVER_SAVE_FAIL = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/** ② 비회원이 휴대폰(기기)에 저장하다 실패 */
export const DEVICE_SAVE_FAIL = '저장에 실패했습니다. 휴대폰 저장 공간을 확인해 주세요.'

/** ③ 저장하는 사이 로그인 정보가 바뀜 */
export const SESSION_CHANGED_FAIL = '로그인 정보가 바뀌어 저장하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.'

/** ④ 로그인 계정에 저장할 서버 차량이 없음 */
export const NO_VEHICLE_SAVE_FAIL = '메인 차량이 없어 저장하지 못했습니다. 차량 관리에서 메인 차량을 등록해 주세요.'

/**
 * 서버에 저장하던 중이면 ①, 기기에 저장하던 중이면 ②.
 * @param {boolean} onServer
 */
export function saveFailMessage(onServer) {
  return onServer ? SERVER_SAVE_FAIL : DEVICE_SAVE_FAIL
}

/** 실패 안내에만 쓰는 낱말 — 알림을 빨간 실패 모양으로 보일지 가른다(로드맵 83). */
const FAILURE_WORDS = ['실패', '못했', '수 없', '지원하지 않', '올바르지 않', '맞지 않', '손상', '오류', '다시 시도']

/**
 * 알림 문구가 실패 안내인지.
 * @param {string} message
 */
export function isFailureMessage(message) {
  return FAILURE_WORDS.some((word) => message.includes(word))
}
