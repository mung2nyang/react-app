// 로드맵 95 — 문자 앱 주소: 기본 ?, 아이폰 계열 &(공유 창·문자 문구 시트에서 옮긴 같은 단언).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSmsHref } from './smsHref.ts'

const BODY = '안녕 테스트'

test('buildSmsHref: 기본 UA는 ?, iPhone·iPad UA는 &', () => {
  assert.equal(buildSmsHref('01012345678', BODY, 'Mozilla/5.0 (Linux; Android 14)'), `sms:01012345678?body=${encodeURIComponent(BODY)}`)
  assert.equal(buildSmsHref('01012345678', BODY, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), `sms:01012345678&body=${encodeURIComponent(BODY)}`)
  assert.equal(buildSmsHref('01012345678', BODY, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), `sms:01012345678&body=${encodeURIComponent(BODY)}`)
})
