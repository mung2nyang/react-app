// 로드맵 24-E — 읽어 주기: 한국어로 한 번, 새로 읽으면 앞 것 멈춤, [멈추기]·화면이 사라지면 멈춤, 지원 안 하면 조용히.
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: useSpeechOutput } = await import('./useSpeechOutput.ts')

function installFakeSynth() {
  const synth = { spoken: [], cancels: 0, speak(utterance) { this.spoken.push(utterance) }, cancel() { this.cancels += 1 } }
  window.speechSynthesis = synth
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = '' } }
  return synth
}

function removeFakeSynth() {
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
}

async function mount() {
  const latest = { current: null }
  function Harness() {
    latest.current = useSpeechOutput()
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness)) })
  return { latest, async unmount() { await act(async () => { root.unmount() }) } }
}

test('지원 안 하는 브라우저: 읽기·멈추기를 불러도 아무 일 없음', async () => {
  removeFakeSynth()
  const view = await mount()
  try {
    assert.equal(view.latest.current.supported, false)
    await act(async () => { view.latest.current.speak('10월 매출은 0원입니다.') })
    assert.equal(view.latest.current.speaking, false)
    await act(async () => { view.latest.current.stop() })
  } finally { await view.unmount() }
})

test('읽기: 한국어로 한 번, 다 읽으면 읽는 중이 꺼짐', async () => {
  const synth = installFakeSynth()
  const view = await mount()
  try {
    assert.equal(view.latest.current.supported, true)
    await act(async () => { view.latest.current.speak('10월 매출은 3,303,011원입니다.') })
    assert.equal(synth.spoken.length, 1)
    assert.equal(synth.spoken[0].text, '10월 매출은 3,303,011원입니다.')
    assert.equal(synth.spoken[0].lang, 'ko-KR')
    assert.equal(view.latest.current.speaking, true)
    await act(async () => { synth.spoken[0].onend() })
    assert.equal(view.latest.current.speaking, false)
  } finally {
    await view.unmount()
    removeFakeSynth()
  }
})

test('새로 읽으면 앞 것을 멈추고, 앞 것이 끝났다는 소식은 무시한다', async () => {
  const synth = installFakeSynth()
  const view = await mount()
  try {
    await act(async () => { view.latest.current.speak('첫 답') })
    const before = synth.cancels
    await act(async () => { view.latest.current.speak('둘째 답') })
    assert.equal(synth.cancels, before + 1)
    await act(async () => { synth.spoken[0].onerror() })
    assert.equal(view.latest.current.speaking, true, '앞 것의 끝 소식으로 꺼지면 안 된다')
  } finally {
    await view.unmount()
    removeFakeSynth()
  }
})

test('멈추기는 바로 멈추고, 읽는 중에 화면이 사라져도 멈춘다', async () => {
  const synth = installFakeSynth()
  const view = await mount()
  await act(async () => { view.latest.current.speak('첫 답') })
  const before = synth.cancels
  await act(async () => { view.latest.current.stop() })
  assert.equal(synth.cancels, before + 1)
  assert.equal(view.latest.current.speaking, false)
  await act(async () => { view.latest.current.speak('둘째 답') })
  const beforeUnmount = synth.cancels
  await view.unmount()
  assert.equal(synth.cancels, beforeUnmount + 1)
  removeFakeSynth()
})
