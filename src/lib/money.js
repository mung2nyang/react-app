// Step 4 도메인 폴더 이동: 실제 구현은 domain/money.js로 옮겼다. 이 파일은 기존
// `from '../lib/money.js'` 임포트 경로를 쓰는 컴포넌트들이 안 깨지게 두는 얇은 재수출
// shim이다 — Step 5~10에서 각 화면을 다시 짤 때 domain/ 경로로 직접 바꾸면 지울 수 있다.
export * from '../domain/money.js'
