import type { AudioWindow } from '@proj-airi/pipelines-audio'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SileroVad } from './silero-vad'

/** A request report of `fake-silero-vad.worker.ts`. */
type FakeRequest
  = | { kind: 'received', length: number, reset: boolean }
    | { kind: 'finished', aborted: boolean }
    | { kind: 'closed' }

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
})

/** A `SileroVad` with the fake Worker, and the requests that the Worker reports. */
function createVad() {
  const worker = new Worker(new URL('./fake-silero-vad.worker.ts', import.meta.url), { type: 'module' })
  const channel = new BroadcastChannel('fake-silero-vad')
  const requests: FakeRequest[] = []
  channel.onmessage = event => requests.push(event.data)
  cleanups.push(() => {
    channel.close()
    worker.terminate()
  })
  return { vad: new SileroVad({ worker }), worker, requests }
}

function audioWindow(channels: number[], options: { discontinuity?: boolean, samples?: number, sampleRate?: number } = {}): AudioWindow {
  const samples = options.samples ?? 512
  return {
    range: { sourceId: 'test', startFrame: 0, endFrame: samples },
    sampleRate: options.sampleRate ?? 16000,
    channels: channels.map(value => new Float32Array(samples).fill(value)),
    discontinuity: options.discontinuity ?? false,
  }
}

describe('silero vad', () => {
  it('scores a window in the Worker with its channels averaged', async () => {
    const { vad, requests } = createVad()

    const score = await vad.score(audioWindow([0.2, 0.4]), new AbortController().signal)

    expect(score).toBeCloseTo(0.3)
    await vi.waitFor(() => expect(requests).toEqual([{ kind: 'received', length: 512, reset: false }, { kind: 'finished', aborted: false }]))
  })

  it('starts a new model state after a discontinuity', async () => {
    const { vad, requests } = createVad()

    await vad.score(audioWindow([0.1]), new AbortController().signal)
    await vad.score(audioWindow([0.1], { discontinuity: true }), new AbortController().signal)

    await vi.waitFor(() => expect(requests.flatMap(request => request.kind === 'received' ? [request.reset] : [])).toEqual([false, true]))
  })

  it('rejects a window that is not 512 samples at 16 kHz without sending it', async () => {
    const { vad, requests } = createVad()

    await expect(vad.score(audioWindow([0.1], { samples: 480 }), new AbortController().signal)).rejects.toThrow('Silero VAD requires 512 samples at 16 kHz')
    await expect(vad.score(audioWindow([0.1], { sampleRate: 48000 }), new AbortController().signal)).rejects.toThrow('Silero VAD requires 512 samples at 16 kHz')
    // A valid window afterwards is the first request that the Worker receives.
    await vad.score(audioWindow([0.1]), new AbortController().signal)
    await vi.waitFor(() => expect(requests.filter(request => request.kind === 'received')).toHaveLength(1))
  })

  it('does not send a window whose signal already aborted', async () => {
    const { vad, requests } = createVad()
    const controller = new AbortController()
    controller.abort(new Error('Observer closed'))

    await expect(vad.score(audioWindow([0.1]), controller.signal)).rejects.toThrow('Observer closed')
    await vad.score(audioWindow([0.1]), new AbortController().signal)
    await vi.waitFor(() => expect(requests.filter(request => request.kind === 'received')).toHaveLength(1))
  })

  it('cancels a pending window in the Worker when its signal aborts', async () => {
    const { vad, requests } = createVad()
    const controller = new AbortController()

    // The fake Worker holds a window that starts with 1 until its signal aborts.
    const pending = vad.score(audioWindow([1]), controller.signal)
    await vi.waitFor(() => expect(requests).toEqual([{ kind: 'received', length: 512, reset: false }]))
    controller.abort(new Error('Observer closed'))

    await expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(requests.at(-1)).toEqual({ kind: 'finished', aborted: true }))
  })

  it('releases the model and ends the Worker on close, and rejects later windows', async () => {
    const { vad, worker, requests } = createVad()
    const terminate = vi.spyOn(worker, 'terminate')

    await Promise.all([vad.close(), vad.close()])

    await vi.waitFor(() => expect(requests).toEqual([{ kind: 'closed' }]))
    expect(terminate).toHaveBeenCalledOnce()
    await expect(vad.score(audioWindow([0.1]), new AbortController().signal)).rejects.toThrow('VAD model is closed')
  })

  it('rejects pending and later windows when the Worker fails', async () => {
    const { vad, worker } = createVad()
    // The crash is the expected result here. Without this, the browser reports the Worker error to the page as well.
    worker.addEventListener('error', event => event.preventDefault())

    // The fake Worker throws an uncaught error for a window that starts with 2, and holds the window.
    await expect(vad.score(audioWindow([2]), new AbortController().signal)).rejects.toThrow()
    await expect(vad.score(audioWindow([0.1]), new AbortController().signal)).rejects.toThrow()
  })
})
