// 로드맵 18-E: 인터넷 없이 앱 주소를 열면 브라우저 오류 화면 대신 안내 화면(offline.html).
// 앱 파일·서버 데이터는 저장하지 않고 손대지 않는다 — 새 버전 배포 뒤 옛 화면이 남지 않게.
const CACHE = 'offline-v2'
const OFFLINE_URL = new URL('offline.html', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  )
})

// 이름이 다른 옛 저장분은 지운다(안내 화면을 바꿀 때 CACHE 이름을 올림).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// 화면 주소 열기만 지켜보다가, 인터넷 없이 실패했을 때만 안내 화면. 그 밖의 요청은 그대로 통과.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL))),
  )
})
