// @ts-check
// 배포본 + 지원 브라우저일 때만 안내 화면용 서비스워커(public/sw.js) 등록. 실패해도 앱은 그대로.

/**
 * @param {{ prod: boolean, base: string, nav?: { serviceWorker?: { register: (url: string, options: { scope: string }) => Promise<ServiceWorkerRegistration|void> } } }} env
 * @returns {Promise<boolean>} 등록했으면 true
 */
export async function registerServiceWorker({ prod, base, nav }) {
  if (!prod || !nav?.serviceWorker) return false
  try {
    await nav.serviceWorker.register(`${base}sw.js`, { scope: base })
    return true
  } catch {
    return false
  }
}
