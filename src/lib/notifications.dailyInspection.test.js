// @ts-check
// 로드맵 9-B-1 — 일상점검표 의무화 알림: 로그인 계정 + 내 메인 차량 스위치 꺼짐 + 다시 보지 않기 안 누름일 때만.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { collectNotifications, dismissNotification, DAILY_INSPECTION_NOTICE_ID } from './notifications.js'
import { commitSettings } from '../store/commitHelpers.js'
import { normalizeCarSettings, normalizeSettings } from '../domain/practiceSettings.js'

/** @param {string} ownerKey */
const notice = (ownerKey) => collectNotifications(ownerKey).find((item) => item.id === DAILY_INSPECTION_NOTICE_ID)

beforeEach(() => { localStorage.clear() })

test('로그인 계정 + 메인 스위치 꺼짐(처음 값) → 알림 1건, 버튼 이름 [바로 사용하기]·[다시 보지 않기]', () => {
  commitSettings('di-owner-1', normalizeSettings({}), { syncToCloud: false })
  const item = notice('di-owner-1')
  assert.ok(item)
  assert.equal(item.title, '일상점검표가 의무화되었습니다')
  assert.equal(item.body, '관련 법령에 따라 출발 전 일상점검표 작성이 의무화되었습니다. 아래 버튼을 눌러 일상점검표 기능을 켜 주세요.')
  assert.equal(item.actionLabel, '바로 사용하기')
  assert.equal(item.dismissLabel, '다시 보지 않기')
})

test('메인 스위치가 켜져 있으면 알림 없음(기사차량 스위치는 상관없음)', () => {
  commitSettings('di-owner-2', normalizeSettings({ dailyInspectionOn: true }), { syncToCloud: false })
  assert.equal(notice('di-owner-2'), undefined)
  commitSettings('di-owner-3', normalizeSettings({ subCarSettings: { '11가1111': normalizeCarSettings({ dailyInspectionOn: true }) } }), { syncToCloud: false })
  assert.ok(notice('di-owner-3'), '기사차량만 켜져 있으면 메인 기준으로 알림')
})

test('다시 보지 않기 누르면 그 기기에서 사라짐, 비회원은 알림 없음', () => {
  commitSettings('di-owner-4', normalizeSettings({}), { syncToCloud: false })
  dismissNotification('di-owner-4', DAILY_INSPECTION_NOTICE_ID)
  assert.equal(notice('di-owner-4'), undefined)
  assert.equal(notice('guest'), undefined)
})

test('설정 정규화: 처음 값 꺼짐, 메인·기사차량 따로 유지', () => {
  const s = normalizeSettings({ dailyInspectionOn: true, subCarSettings: { '22가2222': normalizeCarSettings({ dailyInspectionOn: true }), '33가3333': normalizeCarSettings({}) } })
  assert.equal(normalizeSettings({}).dailyInspectionOn, false)
  assert.equal(s.dailyInspectionOn, true)
  assert.equal(s.subCarSettings?.['22가2222']?.dailyInspectionOn, true)
  assert.equal(s.subCarSettings?.['33가3333']?.dailyInspectionOn, false)
})

test('기기 저장값 검사: 새 이름(dailyInspectionOn)은 허용, 참거짓이 아니면 거부', async () => {
  const { writeJsonKey } = await import('../store/persist.js')
  const { readPersistDomain } = await import('../store/persistDomainRead.js')
  writeJsonKey('settings', 'di-persist', { dailyInspectionOn: true, subCarSettings: { '11가1111': { dailyInspectionOn: false } } })
  assert.notEqual(readPersistDomain('settings', 'di-persist').kind, 'schema')
  writeJsonKey('settings', 'di-persist', { dailyInspectionOn: 'yes' })
  assert.equal(readPersistDomain('settings', 'di-persist').kind, 'schema')
  writeJsonKey('settings', 'di-persist', { subCarSettings: { '11가1111': { dailyInspectionOn: 1 } } })
  assert.equal(readPersistDomain('settings', 'di-persist').kind, 'schema')
})
