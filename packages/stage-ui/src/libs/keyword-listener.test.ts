import type { KWSModelPack } from '@sherpaw/kws'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { KeywordListener } from './keyword-listener'

const detector = vi.hoisted(() => ({
  processAudio: vi.fn<(samples: Float32Array, sampleRate: number) => Promise<[]>>(),
  setKeywords: vi.fn<() => Promise<void>>(),
  reset: vi.fn<() => Promise<void>>(),
  dispose: vi.fn(),
}))

vi.mock('@sherpaw/kws', () => ({
  createKeywordSpotter: vi.fn(async () => detector),
}))

vi.mock('@sherpaw/kws/worker?worker', () => ({ default: class KwsWorker {} }))

let worklet: { port: { onmessage?: (event: MessageEvent<{ buffer: Float32Array }>) => void }, disconnect: () => void }

beforeEach(() => {
  detector.processAudio.mockReset().mockResolvedValue([])
  detector.setKeywords.mockReset().mockResolvedValue(undefined)
  detector.reset.mockReset().mockResolvedValue(undefined)
  detector.dispose.mockReset()

  worklet = { port: {}, disconnect: vi.fn() }
  vi.stubGlobal('AudioWorkletNode', class {
    port = worklet.port
    disconnect = worklet.disconnect
    connect() {}
  })
  vi.stubGlobal('AudioContext', class {
    sampleRate = 16_000
    state = 'running'
    destination = {}
    audioWorklet = { addModule: async () => {} }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} } }
    async close() { this.state = 'closed' }
  })
})

afterEach(() => vi.unstubAllGlobals())

async function createListener(onError: (error: unknown) => void) {
  const listener = new KeywordListener({} as KWSModelPack, '/audio-worklet.js', vi.fn(), onError)
  await listener.start({} as MediaStream, [{ label: 'A', matches: [{ tokens: ['A'] }] }])
  return listener
}

async function receive(samples: Float32Array) {
  worklet.port.onmessage?.({ data: { buffer: samples } } as MessageEvent<{ buffer: Float32Array }>)
  await vi.waitFor(() => expect(detector.processAudio).toHaveBeenCalled())
}

describe('keyword listener PCM boundary', () => {
  it('sanitizes microphone samples and sends 100 ms batches', async () => {
    const onError = vi.fn()
    const listener = await createListener(onError)
    const samples = new Float32Array(1600)
    samples.set([1.25, -1.25, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])

    worklet.port.onmessage?.({ data: { buffer: samples.subarray(0, 512) } } as MessageEvent<{ buffer: Float32Array }>)
    expect(detector.processAudio).not.toHaveBeenCalled()
    await receive(samples.subarray(512))

    expect(detector.processAudio).toHaveBeenCalledOnce()
    const [batch, sampleRate] = detector.processAudio.mock.calls[0]!
    expect(sampleRate).toBe(16_000)
    expect(batch).toHaveLength(1600)
    expect(batch.slice(0, 5)).toEqual([1, -1, 0, 0, 0])
    expect(onError).not.toHaveBeenCalled()
    listener.stop()
  })

  it('discards a partial batch when detection pauses', async () => {
    const listener = await createListener(vi.fn())
    worklet.port.onmessage?.({ data: { buffer: new Float32Array(800).fill(1) } } as MessageEvent<{ buffer: Float32Array }>)

    await listener.pause()
    await listener.resume()
    await receive(new Float32Array(1600))

    expect(detector.processAudio).toHaveBeenCalledOnce()
    expect(detector.processAudio.mock.calls[0]![0].every(value => value === 0)).toBe(true)
    listener.stop()
  })

  it('does not report a pending reset as a detection failure after stopping', async () => {
    // ROOT CAUSE:
    //
    // Backpressure can start an asynchronous spotter reset just before the
    // microphone closes. Disposal rejects that reset. The old catch handler
    // reported the rejection as a live Wake Word detection failure.
    // A stopped listener now ignores results from its previous generation.
    let rejectReset!: (error: Error) => void
    detector.processAudio.mockImplementation(() => new Promise(() => {}))
    detector.reset.mockImplementation(() => new Promise<void>((_, reject) => {
      rejectReset = reject
    }))
    const onError = vi.fn()
    const listener = await createListener(onError)

    for (let index = 0; index < 12; index++)
      worklet.port.onmessage?.({ data: { buffer: new Float32Array(1600) } } as MessageEvent<{ buffer: Float32Array }>)
    expect(detector.reset).toHaveBeenCalledOnce()

    listener.stop()
    rejectReset(new Error('Keyword spotter has been disposed'))
    await Promise.resolve()
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a reset failure while listening is still active', async () => {
    const error = new Error('Reset failed')
    detector.processAudio.mockImplementation(() => new Promise(() => {}))
    detector.reset.mockRejectedValue(error)
    const onError = vi.fn()
    const listener = await createListener(onError)

    for (let index = 0; index < 12; index++)
      worklet.port.onmessage?.({ data: { buffer: new Float32Array(1600) } } as MessageEvent<{ buffer: Float32Array }>)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error))
    listener.stop()
  })
})
