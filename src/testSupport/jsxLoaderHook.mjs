// 4차 재작업(사용자 지시 5번) — "실제 BrowserRouter 통합 테스트"를 쓰려면 App.jsx 등
// JSX 파일을 plain `node --test` 프로세스에서 그대로 import할 수 있어야 하는데,
// Node는 JSX 구문을 모른다(Vite가 dev/build에서만 변환해 준다). 이 파일은 Node
// 모듈 커스터마이징 훅(module.register)으로 등록하는 로더로, `.jsx` 확장자 파일을
// esbuild로 즉석에서 트랜스파일해서 넘긴다 — 프로덕션 빌드 경로는 전혀 안 건드리고,
// 이 특정 통합 테스트 하나를 위한 테스트 전용 인프라다.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

export async function load(url, context, nextLoad) {
  // .css는 Vite가 번들 시에만 처리하는 스타일 부작용 import다 — 이 테스트는 렌더
  // 로직/라우팅만 검증하므로 빈 모듈로 대체한다(실제 스타일은 무관).
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {}', shortCircuit: true }
  if (!url.endsWith('.jsx')) return nextLoad(url, context)
  const filePath = fileURLToPath(url)
  const source = await readFile(filePath, 'utf8')
  const { code } = esbuild.transformSync(source, {
    loader: 'jsx',
    format: 'esm',
    jsx: 'automatic',
    sourcefile: filePath,
  })
  return { format: 'module', source: code, shortCircuit: true }
}
