// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBizNumber, isBizNumberChecksumOk, tonnageDigits, tonnageValue } from './formatPhone.js'

test('사업자번호 입력: 숫자만 받아 000-00-00000 모양으로 - 자동 삽입, 10자리까지', () => {
  assert.equal(formatBizNumber('123'), '123')
  assert.equal(formatBizNumber('1234'), '123-4')
  assert.equal(formatBizNumber('12345'), '123-45')
  assert.equal(formatBizNumber('123456'), '123-45-6')
  assert.equal(formatBizNumber('1234567890'), '123-45-67890')
  assert.equal(formatBizNumber('123-45-67890'), '123-45-67890')
  assert.equal(formatBizNumber('12 3a45'), '123-45')
  assert.equal(formatBizNumber('123456789012'), '123-45-67890')
  assert.equal(formatBizNumber(''), '')
})

test('사업자번호 검증번호: 10자리일 때만 마지막 자리를 확인', () => {
  assert.equal(isBizNumberChecksumOk('123-45-67891'), true)
  assert.equal(isBizNumberChecksumOk('1234567891'), true)
  assert.equal(isBizNumberChecksumOk('123-45-67890'), false)
  assert.equal(isBizNumberChecksumOk('123-45-6789'), true, '9자리는 아직 판단 안 함')
  assert.equal(isBizNumberChecksumOk(''), true)
})

test('차량 톤수: 숫자(소수 한 자리)만 보이고 저장은 "N톤"', () => {
  assert.equal(tonnageDigits('21톤'), '21')
  assert.equal(tonnageDigits('5 톤'), '5')
  assert.equal(tonnageDigits('2.55'), '2.5')
  assert.equal(tonnageDigits('1.5.3'), '1.5')
  assert.equal(tonnageValue('25'), '25톤')
  assert.equal(tonnageValue('2.'), '2.톤', '입력 중엔 점 유지')
  assert.equal(tonnageValue('2.', true), '2톤')
  assert.equal(tonnageValue(''), '')
  assert.equal(tonnageValue('톤'), '')
})
