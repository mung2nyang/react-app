// 여러 store/lib 테스트가 공유하는 최소 DOM 전역(localStorage) 설정.
// persist.js/cloudSync.js는 브라우저의 전역 localStorage를 그대로 쓰므로, Node 테스트
// 프로세스에도 jsdom으로 그 전역을 채워 넣는다 — originalWindow.js가 이미 이 프로젝트에서
// jsdom을 쓰고 있는 것과 같은 이유. 부작용 임포트로만 쓴다: `import '../testSupport/setupDom.js'`
// 를 다른 임포트보다 먼저 적어서, persist.js 등이 읽어 들일 때 이미 전역이 있게 한다.
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })

globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage
// Node 21+는 전역 navigator를 읽기 전용 getter로 이미 갖고 있어 그냥 대입하면 던진다.
// 이 프로젝트가 테스트하는 코드는 navigator를 안 쓰므로 있으면 덮어쓰고, 없으면 넘어간다.
try {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
} catch {
  // 이미 읽기 전용으로 굳어 있으면(configurable:false) 그냥 Node 기본 navigator를 둔다.
}
