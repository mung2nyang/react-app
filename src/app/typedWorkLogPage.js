// @ts-check
// Step 5(달력 홈 재작성) 재감사 3차: WorkLogPage.jsx(Step 6 전까지 손대지 않는
// 811줄짜리 레거시 미타입 컴포넌트)와 MainPageRoute.jsx(`// @ts-check`) 사이의 타입
// 경계 — 이 파일은 순수 런타임 재수출만 한다. 타입 선언은 옆의
// typedWorkLogPage.d.ts가 전담한다(캐스팅이 아니라 "이 모듈의 타입은 이거다"라고
// 선언하는 정식 TS 메커니즘 — 같은 이름의 .d.ts가 있으면 TS는 .js의 구현에서
// 타입을 추론하지 않고 .d.ts를 그대로 쓴다). object를 경유한 이중 단언은 여기서
// 완전히 없앴다 — object로 한 번 감쌌다가 원하는 타입으로 다시 단언하는 건, TS가
// "두 함수 타입이 충분히 겹치지 않는다"며 unknown 경유를 요구하는 것을 object로
// 흉내 낸 것일 뿐이라는 지적을 받았다(정확한 지적이다 — 실질적으로 unknown 대용).
export { default as TypedWorkLogPage } from '../components/WorkLogPage.jsx'
