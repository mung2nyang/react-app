// 로드맵 24-E·24-E2 — 읽어 주기: xAI 소리를 먼저 틀고, 못 받거나 못 틀면 휴대폰 목소리(한국어)로 한 번.
// 새로 읽으면 앞 것 멈춤, [멈추기]·화면이 사라지면 멈춤, 둘 다 없으면 조용히.
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

/** @type {Array<string>} */
const asked = []
/** @type {(text: string) => Promise<Blob|null>} */
let voice = async () => null
mock.module('../api/unbiseoVoice.ts', { namedExports: { requestUnbiseoVoice: (/** @type {string} */ text) => { asked.push(text); return voice(text) } } })

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: useSpeechOutput } = await import('./useSpeechOutput.ts')

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0) })

function installFakeSynth() {
  const synth = { spoken: [], cancels: 0, speak(utterance) { this.spoken.push(utterance) }, cancel() { this.cancels += 1 } }
  window.speechSynthesis = synth
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = '' } }
  return synth
}

/** @param {{ failPlay?: boolean }} [options] */
function installFakeAudio({ failPlay = false } = {}) {
  const played = []
  const urls = { made: 0, revoked: 0 }
  window.Audio = class {
    constructor(src) { this.src = src; this.paused = true; played.push(this) }
    play() { if (failPlay) return Promise.reject(new Error('blocked')); this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  URL.createObjectURL = () => { urls.made += 1; return `blob:${urls.made}` }
  URL.revokeObjectURL = () => { urls.revoked += 1 }
  return { played, urls }
}

function removeFakes() {
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
  delete window.Audio
  voice = async () => null
  asked.length = 0
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

test('둘 다 없는 브라우저: 읽기·멈추기를 불러도 아무 일 없고 서버도 안 부름', async () => {
  removeFakes()
  const view = await mount()
  try {
    assert.equal(view.latest.current.supported, false)
    await act(async () => { view.latest.current.speak('10월 매출은 0원입니다.'); await flush() })
    assert.equal(view.latest.current.speaking, false)
    assert.deepEqual(asked, [])
    await act(async () => { view.latest.current.stop() })
  } finally { await view.unmount() }
})

test('xAI 소리를 받으면 그 소리를 틀고 휴대폰 목소리는 안 씀, 다 틀면 읽는 중이 꺼지고 소리 주소를 버림', async () => {
  const synth = installFakeSynth()
  const audio = installFakeAudio()
  voice = async () => new Blob(['mp3'], { type: 'audio/mpeg' })
  const view = await mount()
  try {
    await act(async () => { view.latest.current.speak('10월 매출은 3,303,011원입니다.'); await flush() })
    assert.deepEqual(asked, ['10월 매출은 3,303,011원입니다.'])
    assert.equal(audio.played.length, 1)
    assert.equal(audio.played[0].paused, false)
    assert.equal(synth.spoken.length, 0)
    assert.equal(view.latest.current.speaking, true)
    await act(async () => { audio.played[0].onended() })
    assert.equal(view.latest.current.speaking, false)
    assert.equal(audio.urls.revoked, 1)
  } finally {
    await view.unmount()
    removeFakes()
  }
})

test('xAI 소리를 못 받으면(오류·5초 넘음) 휴대폰 목소리로 한국어 한 번', async () => {
  const synth = installFakeSynth()
  const audio = installFakeAudio()
  const view = await mount()
  try {
    await act(async () => { view.latest.current.speak('10월 매출은 0원입니다.'); await flush() })
    assert.equal(audio.played.length, 0)
    assert.equal(synth.spoken.length, 1)
    assert.equal(synth.spoken[0].text, '10월 매출은 0원입니다.')
    assert.equal(synth.spoken[0].lang, 'ko-KR')
    await act(async () => { synth.spoken[0].onend() })
    assert.equal(view.latest.current.speaking, false)
  } finally {
    await view.unmount()
    removeFakes()
  }
})

test('소리를 받았는데 못 틀면(재생 막힘) 휴대폰 목소리로, 오류가 두 번 와도 한 번만 읽는다', async () => {
  const synth = installFakeSynth()
  const audio = installFakeAudio({ failPlay: true })
  voice = async () => new Blob(['mp3'], { type: 'audio/mpeg' })
  const view = await mount()
  try {
    await act(async () => { view.latest.current.speak('첫 답'); await flush() })
    await act(async () => { audio.played[0].onerror?.() })
    assert.equal(synth.spoken.length, 1)
    assert.equal(view.latest.current.speaking, true)
    assert.equal(audio.urls.revoked, 1)
  } finally {
    await view.unmount()
    removeFakes()
  }
})

test('받는 중에 멈추면 늦게 온 소리는 틀지 않는다, 새로 읽으면 앞 소리를 멈춘다', async () => {
  installFakeSynth()
  const audio = installFakeAudio()
  /** @type {Array<(blob: Blob) => void>} */
  const pending = []
  voice = () => new Promise((resolve) => { pending.push(resolve) })
  const view = await mount()
  try {
    await act(async () => { view.latest.current.speak('첫 답') })
    await act(async () => { view.latest.current.stop() })
    await act(async () => { pending[0](new Blob(['a'])); await flush() })
    assert.equal(audio.played.length, 0, '멈춘 뒤 온 소리')
    assert.equal(view.latest.current.speaking, false)

    await act(async () => { view.latest.current.speak('둘째 답') })
    await act(async () => { pending[1](new Blob(['b'])); await flush() })
    await act(async () => { view.latest.current.speak('셋째 답') })
    assert.equal(audio.played[0].paused, true, '앞 소리 멈춤')
    await act(async () => { audio.played[0].onended?.() })
    assert.equal(view.latest.current.speaking, true, '앞 것의 끝 소식으로 꺼지면 안 된다')
  } finally {
    await view.unmount()
    removeFakes()
  }
})

test('휴대폰 목소리로 읽는 중 [멈추기]·화면이 사라지면 멈춘다', async () => {
  const synth = installFakeSynth()
  const view = await mount()
  await act(async () => { view.latest.current.speak('첫 답'); await flush() })
  const before = synth.cancels
  await act(async () => { view.latest.current.stop() })
  assert.equal(synth.cancels, before + 1)
  assert.equal(view.latest.current.speaking, false)
  await act(async () => { view.latest.current.speak('둘째 답'); await flush() })
  const beforeUnmount = synth.cancels
  await view.unmount()
  assert.equal(synth.cancels, beforeUnmount + 1)
  removeFakes()
})

test('소리를 트는 중에 화면이 사라지면 소리를 멈춘다', async () => {
  installFakeSynth()
  const audio = installFakeAudio()
  voice = async () => new Blob(['mp3'])
  const view = await mount()
  await act(async () => { view.latest.current.speak('첫 답'); await flush() })
  await view.unmount()
  assert.equal(audio.played[0].paused, true)
  removeFakes()
})
