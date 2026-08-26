// Step 0-4 감사 보완: `/app/day/:date`를 닫을 때 어디로 갈지 정하는 순수 함수.
// MainPageRoute.jsx가 이 함수만 쓰고, 로직은 여기 있어서 React 없이 테스트할 수 있다.

/**
 * @typedef {{ mode: 'back' } | { mode: 'replace', to: string }} WorkLogCloseTarget
 */

/**
 * 달력 셀 클릭으로 들어왔으면(진짜 뒤로 갈 히스토리 엔트리가 있으므로) 브라우저
 * 뒤로가기와 같은 `navigate(-1)`을 쓴다. 새로고침/북마크/알림 딥링크처럼 직접
 * 진입했으면 -1은 앱 밖으로 나갈 수 있으니 대신 달력으로 교체 이동한다 — 뒤로가기를
 * 다시 눌러도 일지로 재진입하지 않는다(replace라 히스토리에 일지 엔트리가 없다).
 * @param {{ from?: string } | null | undefined} locationState
 * @returns {WorkLogCloseTarget}
 */
export function resolveWorkLogCloseTarget(locationState) {
  if (locationState?.from === 'calendar') return { mode: 'back' }
  return { mode: 'replace', to: '/app' }
}
