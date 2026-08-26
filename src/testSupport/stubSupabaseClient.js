// store/*.test.js는 supabase 동작 자체를 테스트하지 않는데도, app-store.js가
// (scheduleCloudSync를 통해) cloudSync.js를 임포트하면 그게 실제 supabaseClient.js의
// createClient()를 불러서 Node 테스트 프로세스가 안 끝나고 매달리는 문제가 있었다
// (Node 21+ realtime/auth 내부 타이머가 이벤트 루프를 붙잡는다). 이 파일을 다른 임포트보다
// 먼저 부작용으로 임포트하면, 실제 네트워크 클라이언트 대신 아무것도 안 하는 스텁이 쓰인다.
// --experimental-test-module-mocks 플래그가 있어야 동작한다(package.json의 test 스크립트).
import { mock } from 'node:test'

mock.module('../supabaseClient.js', {
  exports: {
    supabase: {
      from() {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          upsert: () => Promise.resolve({ data: null, error: null }),
          insert: () => Promise.resolve({ data: null, error: null }),
          update: () => Promise.resolve({ data: null, error: null }),
          delete: () => Promise.resolve({ data: null, error: null }),
        }
      },
      auth: { signOut: async () => ({ error: null }) },
    },
  },
})
