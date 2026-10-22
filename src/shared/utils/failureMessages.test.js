// @ts-check
// 로드맵 56-A — 원인을 아는 실패 문구 3가지와, 서버 저장이면 ①·기기 저장이면 ②.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { SERVER_SAVE_FAIL, DEVICE_SAVE_FAIL, SESSION_CHANGED_FAIL, saveFailMessage } = await import('./failureMessages.js')

test('문구 3가지(보리 확정 문구 표)', () => {
  assert.equal(SERVER_SAVE_FAIL, '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
  assert.equal(DEVICE_SAVE_FAIL, '저장에 실패했습니다. 휴대폰 저장 공간을 확인해 주세요.')
  assert.equal(SESSION_CHANGED_FAIL, '로그인 정보가 바뀌어 저장하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.')
})

test('서버에 저장하다 실패하면 네트워크, 기기에 저장하다 실패하면 저장 공간', () => {
  assert.equal(saveFailMessage(true), SERVER_SAVE_FAIL)
  assert.equal(saveFailMessage(false), DEVICE_SAVE_FAIL)
})

test('기기 저장 실패 상수·로그인 바뀜 안내가 같은 문구를 쓴다', async () => {
  const { STORAGE_FAIL_TOAST } = await import('../../data/sync/localCommit.ts')
  assert.equal(STORAGE_FAIL_TOAST, DEVICE_SAVE_FAIL)
  const source = (await import('node:fs')).readFileSync(new URL('../../data/cloud/cloudSession.ts', import.meta.url), 'utf8')
  assert.equal(source.includes('화면을 새로고침한 뒤 다시 시도해 주세요.'), false, '문구를 직접 적지 않고 공용 상수를 쓴다')
  assert.ok(source.includes('SESSION_CHANGED_FAIL'))
})

test('공용 파일 밖에서 ①·③ 문구를 글자로 적은 곳이 없다(로드맵 56-B-1)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const phrases = ['저장에 실패했습니다. 네트워크 상태를 확인해 주세요.', '로그인 정보가 바뀌어 저장하지 못했습니다.']
  /** @type {Array<string>} */
  const found = []
  /** @param {string} dir */
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(js|jsx)$/.test(name) || /\.test\./.test(name) || name === 'failureMessages.js') continue
      const text = readFileSync(full, 'utf8')
      phrases.forEach((phrase) => { if (text.includes(phrase)) found.push(`${full}: ${phrase.slice(0, 12)}`) })
    }
  }
  walk(root)
  assert.deepEqual(found, [])
})

test('알림 문구로 실패를 가린다(로드맵 83) — 앱의 실패 문구는 참, 성공·진행·입력 확인은 거짓', async () => {
  const { isFailureMessage } = await import('./failureMessages.js')
  const failures = [
    SERVER_SAVE_FAIL,
    DEVICE_SAVE_FAIL,
    SESSION_CHANGED_FAIL,
    '백업 파일 생성에 실패했습니다.',
    '데이터 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
    '이 휴대폰에서는 파일 공유를 할 수 없습니다. [PDF 다운로드]로 저장한 뒤 보내 주세요.',
    '이 기기에서는 파일 공유를 지원하지 않습니다.',
    '파일 내용이 올바르지 않습니다.',
    '초대 코드가 맞지 않거나 기한(7일)이 지났습니다. 차주에게 새 코드를 요청해 주세요.',
    '백업 파일이 아니거나 파일이 손상되었습니다.',
    '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    '아직 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.',
    '일부만 저장되었습니다. (성공 2건, 실패 1건) 화면에 남은 항목을 다시 시도해 주세요.',
  ]
  const others = [
    '내역을 등록했습니다.',
    '기록을 다시 불러왔습니다.',
    '백업 데이터를 복원했습니다.',
    '카카오톡으로 보낼 PDF를 준비하고 있습니다.',
    '비회원 모드로 시작합니다. 언제든 마이페이지에서 로그인할 수 있습니다.',
    '해제 요청을 보냈습니다. 상대가 동의하거나 3일이 지나면 해제됩니다.',
    '로그인 후 저장할 수 있습니다.',
    '거래처명을 입력해 주세요.',
    '로그아웃했습니다.',
  ]
  assert.deepEqual(failures.filter((message) => !isFailureMessage(message)), [])
  assert.deepEqual(others.filter((message) => isFailureMessage(message)), [])
})
