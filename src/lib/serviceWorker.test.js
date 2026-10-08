// 로드맵 18-E: 서비스워커 등록 조건 + public/sw.js 동작(화면 주소 열기 실패 때만 안내 화면, 다른 요청은 손 안 댐).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { registerServiceWorker } from './registerServiceWorker.js'

const SCOPE = 'https://getdrivelog.com/'
const OFFLINE = `${SCOPE}offline.html`

test('등록: 배포본 + 지원 브라우저일 때만 /sw.js, 아니면 안 함, 실패해도 오류 없음', async () => {
  /** @type {Array<[string, { scope: string }]>} */
  const calls = []
  const nav = { serviceWorker: { register: async (/** @type {string} */ url, /** @type {{ scope: string }} */ options) => { calls.push([url, options]) } } }
  assert.equal(await registerServiceWorker({ prod: true, base: '/', nav }), true)
  assert.deepEqual(calls, [['/sw.js', { scope: '/' }]])
  assert.equal(await registerServiceWorker({ prod: false, base: '/', nav }), false, '개발 서버')
  assert.equal(await registerServiceWorker({ prod: true, base: '/', nav: {} }), false, '미지원 브라우저')
  assert.equal(calls.length, 1)
  const failing = { serviceWorker: { register: async () => { throw new Error('막힘') } } }
  assert.equal(await registerServiceWorker({ prod: true, base: '/', nav: failing }), false)
})

/** 가짜 브라우저 환경에서 public/sw.js를 실행하고 이벤트 처리기를 돌려준다. */
function loadWorker(/** @type {{ online: boolean }} */ net) {
  /** @type {Record<string, (event: object) => void>} */
  const handlers = {}
  /** @type {Map<string, Map<string, string>>} */
  const store = new Map()
  const openCache = async (/** @type {string} */ name) => {
    if (!store.has(name)) store.set(name, new Map())
    const cache = /** @type {Map<string, string>} */ (store.get(name))
    return {
      add: async (/** @type {string} */ url) => { cache.set(url, `cached:${url}`) },
      match: async (/** @type {string} */ url) => cache.get(url),
    }
  }
  const self = {
    registration: { scope: SCOPE },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (/** @type {string} */ type, /** @type {(event: object) => void} */ fn) => { handlers[type] = fn },
  }
  const context = {
    self,
    URL,
    Promise,
    caches: { open: openCache, keys: async () => [...store.keys()], delete: async (/** @type {string} */ name) => store.delete(name) },
    fetch: async (/** @type {{ url: string }} */ request) => {
      if (!net.online) throw new TypeError('Failed to fetch')
      return `network:${request.url}`
    },
  }
  vm.runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), context)
  /** @param {string} type @param {object} [extra] */
  const fire = async (type, extra = {}) => {
    /** @type {Array<Promise<unknown>>} */
    const waits = []
    /** @type {Promise<unknown> | null} */
    let response = null
    handlers[type]({ ...extra, waitUntil: (/** @type {Promise<unknown>} */ p) => { waits.push(p) }, respondWith: (/** @type {Promise<unknown>} */ p) => { response = p } })
    await Promise.all(waits)
    return { responded: response !== null, response: response ? await response : null }
  }
  return { fire, store }
}

test('서비스워커: 설치 때 안내 화면 저장, 옛 저장분 정리', async () => {
  const net = { online: true }
  const worker = loadWorker(net)
  worker.store.set('offline-old', new Map())
  await worker.fire('install')
  assert.equal(worker.store.get('offline-v2')?.get(OFFLINE), `cached:${OFFLINE}`)
  await worker.fire('activate')
  assert.deepEqual([...worker.store.keys()], ['offline-v2'])
})

test('서비스워커: 화면 주소 열기 — 인터넷 있으면 그대로, 없으면 안내 화면, 다른 요청은 손 안 댐', async () => {
  const net = { online: true }
  const worker = loadWorker(net)
  await worker.fire('install')
  const page = { request: { mode: 'navigate', url: `${SCOPE}app` } }
  assert.deepEqual(await worker.fire('fetch', page), { responded: true, response: `network:${SCOPE}app` })
  net.online = false
  assert.deepEqual(await worker.fire('fetch', page), { responded: true, response: `cached:${OFFLINE}` })
  const asset = { request: { mode: 'cors', url: `${SCOPE}assets/index.js` } }
  assert.equal((await worker.fire('fetch', asset)).responded, false, '앱 파일·서버 데이터는 통과')
})
