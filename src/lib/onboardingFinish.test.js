// @ts-check
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { applyOnboardingWizard, buildOnboardingSettingsPatch } from './onboardingFinish.js'
import { getState } from '../store/app-store.js'
import { readOwnerSettings } from '../store/ownerDataHooks.js'
import { replaceOwnerState } from '../store/owner-state.js'

describe('buildOnboardingSettingsPatch', () => {
  test('workStyle fixed: fixedOn true, callDetail false', () => {
    assert.deepEqual(
      buildOnboardingSettingsPatch({
        workStyle: 'fixed',
        paymentOn: true,
        timeOn: true,
        cargoTonnageOn: false,
        platformOn: true,
        distanceOn: false,
      }),
      {
        fixedOn: true,
        callDetail: false,
        paymentOn: true,
        timeOn: true,
        cargoTonnageOn: false,
        platformOn: true,
        distanceOn: false,
      },
    )
  })

  test('workStyle call: fixedOn false, callDetail true', () => {
    assert.deepEqual(
      buildOnboardingSettingsPatch({
        workStyle: 'call',
        paymentOn: false,
        timeOn: false,
        cargoTonnageOn: true,
        platformOn: false,
        distanceOn: true,
      }),
      {
        fixedOn: false,
        callDetail: true,
        paymentOn: false,
        timeOn: false,
        cargoTonnageOn: true,
        platformOn: false,
        distanceOn: true,
      },
    )
  })

  test('workStyle both: fixedOn·callDetail 둘 다 true로 명시', () => {
    const patch = buildOnboardingSettingsPatch({
      workStyle: 'both',
      paymentOn: true,
      timeOn: false,
      cargoTonnageOn: false,
      platformOn: false,
      distanceOn: false,
    })
    assert.equal(patch.fixedOn, true)
    assert.equal(patch.callDetail, true)
    assert.equal(patch.paymentOn, true)
  })
})

describe('applyOnboardingWizard', () => {
  beforeEach(() => {
    localStorage.clear()
    replaceOwnerState('guest', {
      cars: [],
      settings: {
        theme: 'light',
        inputMode: 'count',
        fixedOn: true,
        callDetail: false,
        paymentOn: false,
        timeOn: false,
        cargoTonnageOn: false,
        platformOn: false,
        distanceOn: false,
      },
      workLogs: { main: {} },
    }, { sync: false })
  })

  test('차량번호가 있으면 설정이 저장되고 main 차량이 생긴다', async () => {
    const ownerKey = 'guest'
    const outcome = await applyOnboardingWizard({
      ownerKey,
      userId: null,
      cars: [],
      wizard: {
        workStyle: 'both',
        paymentOn: true,
        timeOn: true,
        cargoTonnageOn: false,
        platformOn: false,
        distanceOn: true,
        carNumber: '12가3456',
        carTonnage: '5',
      },
    })
    assert.equal(outcome.toast, undefined)

    const settings = readOwnerSettings(ownerKey)
    assert.equal(settings.fixedOn, true)
    assert.equal(settings.callDetail, true)
    assert.equal(settings.paymentOn, true)
    assert.equal(settings.timeOn, true)
    assert.equal(settings.distanceOn, true)

    const cars = getState().cars[ownerKey] || []
    assert.equal(cars.length, 1)
    assert.equal(cars[0].type, 'main')
    assert.equal(cars[0].number, '12가3456')
    assert.equal(cars[0].tonnage, '5')
  })

  test('차량번호가 없으면 차량은 만들지 않고 설정만 저장한다', async () => {
    const ownerKey = 'guest'
    const outcome = await applyOnboardingWizard({
      ownerKey,
      userId: null,
      cars: [],
      wizard: {
        workStyle: 'call',
        paymentOn: false,
        timeOn: false,
        cargoTonnageOn: false,
        platformOn: true,
        distanceOn: false,
        carNumber: '   ',
        carTonnage: '3',
      },
    })
    assert.equal(outcome.toast, undefined)

    const settings = readOwnerSettings(ownerKey)
    assert.equal(settings.fixedOn, false)
    assert.equal(settings.callDetail, true)
    assert.equal(settings.platformOn, true)

    const cars = getState().cars[ownerKey] || []
    assert.equal(cars.length, 0)
  })
})
