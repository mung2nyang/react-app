// @ts-check
// GitHub Pages 프로젝트 사이트(https://mung2nyang.github.io/react-app/)는
// 루트가 `/`가 아니라 `/react-app/`다. Vite `base`와 BrowserRouter basename을 맞춘다.
// `vite`(dev)는 base `/`라 빈 문자열 → 로컬 테스트·기존 App.test 경로(`/app`)와 같다.

export function routerBasename() {
  const env = import.meta.env
  const base = (env && env.BASE_URL) || '/'
  if (base === '/') return ''
  return base.replace(/\/$/, '')
}
