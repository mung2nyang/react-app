// @ts-check
// 10-S-2: 초대코드 10자리 형식·예전 코드 유지·문자 내용·수락 실패 문구.
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
Object.assign(fakeSupabase.auth, {
  getSession: async () => ({ data: { session: { user: { id: 'driver-1' } } }, error: null }),
})
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const {
  formatInviteCode, generateInviteCode, INVITE_CODE_PATTERN, normalizeInviteCode, upsertDriver,
} = await import('../domain/drivers.js')
const { buildDriverInviteSmsHref } = await import('./driverInviteSms.js')
const { redeemDriverInviteCode } = await import('./driverLinkRpc.js')

const draft = { name: '박기사', phone: '010-3333-4444', vehicleNumber: '', startDate: '', endDate: '' }

describe('초대코드 생성·형식', () => {
  test('생성 코드는 헷갈리는 글자 없는 10자리이고 겹치지 않는다', () => {
    const seen = new Set()
    for (let i = 0; i < 300; i += 1) {
      const code = generateInviteCode()
      assert.match(code, INVITE_CODE_PATTERN)
      assert.doesNotMatch(code, /[01OIL]/)
      seen.add(code)
    }
    assert.equal(seen.size, 300)
  })

  test('입력은 대문자로 바꾸고 하이픈·공백을 뺀다, 표시는 5자리씩 하이픈', () => {
    assert.equal(normalizeInviteCode(' a2b3c-4d5e6 '), 'A2B3C4D5E6')
    assert.equal(formatInviteCode('A2B3C4D5E6'), 'A2B3C-4D5E6')
    assert.equal(formatInviteCode('123456'), '123456')
  })
})

describe('초대 저장 검사', () => {
  test('새 초대는 6자리 숫자를 거절하고 생성 코드는 받는다', () => {
    assert.equal(upsertDriver([], { ...draft, inviteCode: '123456' }).error, '[코드 생성]으로 초대 코드를 만들어 주세요.')
    const ok = upsertDriver([], { ...draft, inviteCode: 'a2b3c-4d5e6' })
    assert.equal(ok.error, undefined)
    assert.equal(ok.items[0].inviteCode, 'A2B3C4D5E6')
  })

  test('예전 6자리 코드는 바꾸지 않고 수정할 때만 통과, 다른 6자리로 바꾸면 거절', () => {
    /** @type {Array<import('./outboxTypes.js').DriverRecord>} */
    const items = [{ id: 'd1', ...draft, inviteCode: '123456', status: 'linked' }]
    assert.equal(upsertDriver(items, { ...draft, name: '새이름', inviteCode: '123456' }, 'd1').error, undefined)
    assert.equal(upsertDriver(items, { ...draft, inviteCode: '654321' }, 'd1').error, '[코드 생성]으로 초대 코드를 만들어 주세요.')
    assert.equal(upsertDriver(items, { ...draft, inviteCode: '123456' }).error, '[코드 생성]으로 초대 코드를 만들어 주세요.')
  })
})

describe('초대 문자', () => {
  test('6자리 코드는 문자 발송을 막고, 새 코드는 하이픈 표시·7일 안내를 넣는다', () => {
    const base = { name: '박기사', phone: '010-3333-4444', vehicleNumber: '서울12가3456' }
    const old = buildDriverInviteSmsHref({ ...base, inviteCode: '123456' })
    assert.ok('error' in old)
    const result = buildDriverInviteSmsHref({ ...base, inviteCode: 'A2B3C4D5E6' })
    assert.ok('href' in result)
    const body = decodeURIComponent(result.href.split('body=')[1])
    assert.match(body, /초대 코드: A2B3C-4D5E6/)
    assert.match(body, /7일 동안/)
  })
})

describe('기사 초대코드 수락', () => {
  test('서버에 정리된 코드를 보내고, 빈 결과는 틀림·만료 안내로 바꾼다', async () => {
    resetHandlers()
    /** @type {Array<import('../store/atomicPersist.js').JsonValue|undefined>} */
    const sent = []
    handlers.rpc = { redeem_driver_invite_code: (args) => { sent.push(args); return { data: [], error: null } } }
    await assert.rejects(
      redeemDriverInviteCode(' a2b3c-4d5e6 '),
      { message: '초대 코드가 맞지 않거나 기한(7일)이 지났습니다. 차주에게 새 코드를 요청해 주세요.' },
    )
    assert.deepEqual(sent, [{ p_invite_code: 'A2B3C4D5E6' }])
  })

  test('서버의 실패 횟수 제한 문구는 그대로 보여 준다', async () => {
    resetHandlers()
    handlers.rpc = {
      redeem_driver_invite_code: () => ({ data: null, error: { message: '초대코드를 여러 번 틀렸습니다. 잠시 후 다시 시도해 주세요.' } }),
    }
    await assert.rejects(redeemDriverInviteCode('A2B3C4D5E6'), { message: /여러 번 틀렸습니다/ })
  })
})
