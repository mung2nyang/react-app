// @ts-check
// Vite `base`와 BrowserRouter basename을 맞춘다. 배포 주소(https://getdrivelog.com/)와
// 개발 서버 모두 base `/`라 빈 문자열을 돌려준다(App.test 경로 `/app`과 같음).
// 하위 경로 배포로 바뀌면 그 경로를 basename으로 쓴다.

export function routerBasename() {
  const env = import.meta.env
  const base = (env && env.BASE_URL) || '/'
  if (base === '/') return ''
  return base.replace(/\/$/, '')
}
