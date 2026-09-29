import type { KeywordSpotter, KWSModelPack } from '@sherpaw/kws'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { KeywordListener } from './keyword-listener'

const detector = vi.hoisted(() => ({
  processAudio: vi.fn<KeywordSpotter['processAudio']>(),
  setKeywords: vi.fn<KeywordSpotter['setKeywords']>(),
  reset: vi.fn<KeywordSpotter['reset']>(),
  dispose: vi.fn<KeywordSpotter['dispose']>(),
}))

vi.mock('@sherpaw/kws', () => ({ createKeywordSpotter: vi.fn(async () => detector) }))
vi.mock('@sherpaw/kws/worker?worker', () => ({ default: class KwsWorker {} }))

const keywords = [{ label: 'A', matches: [{ tokens: ['A'] }] }]
const model: KWSModelPack = { data: new ArrayBuffer(0), metadata: { files: [], remote_package_size: 0 } }
const workletSource = `
class TestProcessor extends AudioWorkletProcessor {
  sent = false
  process() {
    if (!this.sent) {
      this.sent = true
      const buffer = new Float32Array(1600)
      buffer.set([1.25, -1.25, NaN, Infinity, -Infinity])
      this.port.postMessage({ buffer })
    }
    return true
  }
}
registerProcessor('vad-audio-worklet-processor', TestProcessor)
`
let audioContext: AudioContext
let stream: MediaStream
let workletUrl: string
let listener: KeywordListener | undefined

beforeEach(async () => {
  detector.processAudio.mockReset().mockResolvedValue([])
  detector.setKeywords.mockReset().mockResolvedValue(undefined)
  detector.reset.mockReset().mockResolvedValue(undefined)
  detector.dispose.mockReset()
  const activate = document.createElement('button')
  activate.textContent = 'Enable audio test'
  document.body.append(activate)
  await page.getByRole('button', { name: 'Enable audio test' }).click()
  activate.remove()
  audioContext = new AudioContext()
  stream = audioContext.createMediaStreamDestination().stream
  await audioContext.resume()
  workletUrl = URL.createObjectURL(new Blob([workletSource], { type: 'text/javascript' }))
})

afterEach(async () => {
  listener?.stop()
  listener = undefined
  stream.getTracks().forEach(track => track.stop())
  await audioContext.close()
  URL.revokeObjectURL(workletUrl)
})

describe('keyword listener lifecycle', () => {
  it('sends normalized 100 ms PCM batches through a real audio graph', async () => {
    const onError = vi.fn()
    listener = new KeywordListener(model, workletUrl, vi.fn(), onError)
    await listener.start(stream, keywords)
    await vi.waitFor(() => expect(detector.processAudio).toHaveBeenCalledOnce())
    const [samples, sampleRate] = detector.processAudio.mock.calls[0]!
    expect(sampleRate).toBe(16_000)
    expect(samples).toHaveLength(1600)
    expect(samples.slice(0, 5)).toEqual(new Float32Array([1, -1, 0, 0, 0]))
    listener.stop()
    expect(stream.getTracks()[0]?.readyState).toBe('live')
    expect(detector.dispose).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/2708
  // ROOT CAUSE:
  // The listener checked its generation before awaiting the pause acknowledgement.
  // A stop during that wait still delivered the detection. Check again after the wait.
  it('discards a wake result when stopped during the pause acknowledgement (Issue #2708)', async () => {
    const paused = Promise.withResolvers<void>()
    detector.processAudio.mockResolvedValue([{ label: 'A', tokens: ['A'], startTime: 0, timestamps: [0] }])
    detector.setKeywords.mockReturnValue(paused.promise)
    const onWake = vi.fn()
    listener = new KeywordListener(model, workletUrl, onWake, vi.fn())
    await listener.start(stream, keywords)
    await vi.waitFor(() => expect(detector.setKeywords).toHaveBeenCalledWith([]))
    listener.stop()
    paused.resolve()
    await paused.promise
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onWake).not.toHaveBeenCalled()
  })
})
