// 4차 재작업(사용자 지시 7번) — 환경 타입 진입점. tsconfig.json의 "types" 옵션이
// vite/client(CSS import, import.meta.env 등)와 node(Node 내장 모듈)를 전역으로
// 가져오지만, 이 파일을 프로젝트 관례대로 명시적으로 남겨 둔다.
/// <reference types="vite/client" />
