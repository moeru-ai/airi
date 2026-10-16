import type { LiveAudioSource, PcmBlock } from './index'

import { describe, expect, it, vi } from 'vitest'

import { AudioInput, capture, createPushStream, createScope, observe } from './index'

/**
 * A live test source whose connections the test drives by hand. Each open call starts a new connection.
 * Each connection has a new id, as the source contract requires. The first one keeps `sourceId`, so assertions stay short.
 */
function pushSource(sourceId = 'mic', options: { reuseId?: boolean } = {}) {
  const connections: { stream: ReturnType<typeof createPushStream<PcmBlock>>, signal: AbortSignal, id: string }[] = []
  const source: LiveAudioSource = {
    live: true,
    open: vi.fn((signal: AbortSignal) => {
      const stream = createPushStream<PcmBlock>()
      const id = connections.length && !options.reuseId ? `${sourceId}-${connections.length + 1}` : sourceId
      connections.push({ stream, signal, id })
      return stream.stream
    }),
  }
  const latest = () => connections.at(-1)!
  return {
    source,
    connections,
    write(startFrame: number, samples: number[], sampleRate = 1000) {
      latest().stream.write({ range: { sourceId: latest().id, startFrame, endFrame: startFrame + samples.length }, sampleRate, channels: [new Float32Array(samples)] })
    },
    end: () => latest().stream.close(),
    fail: (error: Error) => latest().stream.error(error),
  }
}

async function readAll(stream: ReadableStream<PcmBlock>) {
  const samples: number[] = []
  for await (const block of stream)
    samples.push(...block.channels[0])
  return samples
}

describe('audioInput', () => {
  it('opens the source once for concurrent subscribers and releases it after the last one leaves', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source)
    const first = new AbortController()
    const second = new AbortController()
    const firstSamples = readAll(input.subscribe({ signal: first.signal }))
    const secondSamples = readAll(input.subscribe({ signal: second.signal }))
    mic.write(0, [1, 2])

    await expect.poll(() => input.position?.frame).toBe(2)
    first.abort()
    expect(await firstSamples).toEqual([1, 2])
    expect(mic.connections[0].signal.aborted).toBe(false)
    second.abort()
    expect(await secondSamples).toEqual([1, 2])

    expect(mic.source.open).toHaveBeenCalledOnce()
    expect(mic.connections[0].signal.aborted).toBe(true)
  })

  it('replays retained history for a late subscriber and rejects history that was dropped', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source, { historyMs: 4 })
    const live = new AbortController()
    void readAll(input.subscribe({ signal: live.signal }))
    mic.write(0, [1, 2, 3, 4, 5, 6])
    await expect.poll(() => input.position?.frame).toBe(6)

    const late = new AbortController()
    const replayed = readAll(input.subscribe({ from: { sourceId: 'mic', frame: 3 }, signal: late.signal }))
    mic.write(6, [7])
    await expect.poll(() => input.position?.frame).toBe(7)
    late.abort()

    expect(await replayed).toEqual([4, 5, 6, 7])
    await expect(readAll(input.subscribe({ from: { sourceId: 'mic', frame: 0 } }))).rejects.toThrow('Audio history is unavailable')
    live.abort()
  })

  it('starts a new connection with new coordinates after every subscriber left', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source)
    const first = new AbortController()
    void readAll(input.subscribe({ signal: first.signal }))
    mic.write(0, [1])
    await expect.poll(() => input.position?.frame).toBe(1)
    first.abort()
    await expect.poll(() => input.position).toBeUndefined()

    const second = new AbortController()
    void readAll(input.subscribe({ signal: second.signal }))
    mic.write(0, [2])

    await expect.poll(() => input.position?.frame).toBe(1)
    expect(mic.source.open).toHaveBeenCalledTimes(2)
    second.abort()
  })

  // https://github.com/moeru-ai/airi/pull/2769#discussion_r4179013487
  // ROOT CAUSE:
  //
  // History, position, and sample rate were AudioInput fields, shared by all connections.
  // A newer connection skipped the reset, so the old position and history stayed.
  //
  // We fixed this with one Connection object for each open call.
  it('keeps no state of a closing connection when a subscriber arrives before its cleanup', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source, { historyMs: 1000 })
    const first = new AbortController()
    const firstReader = input.subscribe({ signal: first.signal }).getReader()
    mic.write(0, [1, 2])
    await firstReader.read()
    const old = input.position!
    first.abort()
    const second = input.subscribe().getReader()

    expect(input.position).toBeUndefined()
    await expect(readAll(input.subscribe({ from: old }))).rejects.toThrow('Audio history is unavailable')
    mic.write(0, [3])
    expect((await second.read()).value).toMatchObject({ range: { sourceId: 'mic-2', startFrame: 0, endFrame: 1 } })
    expect(input.position).toEqual({ sourceId: 'mic-2', frame: 1 })
  })

  it('fails the subscribers when a source reuses the id of its previous connection', async () => {
    const mic = pushSource('mic', { reuseId: true })
    const input = new AudioInput(mic.source)
    const first = new AbortController()
    const firstReader = input.subscribe({ signal: first.signal }).getReader()
    mic.write(0, [1])
    await firstReader.read()
    first.abort()
    const second = readAll(input.subscribe())
    mic.write(0, [2])

    await expect(second).rejects.toThrow('Audio source reused the id of its previous connection')
  })

  it('errors every subscriber when the source fails', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source)
    const first = readAll(input.subscribe())
    const second = readAll(input.subscribe())
    mic.fail(new Error('Device unplugged'))

    await expect(first).rejects.toThrow('Device unplugged')
    await expect(second).rejects.toThrow('Device unplugged')
  })

  it('errors only the subscriber that stopped reading once its unread audio exceeds the limit', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source)
    const stalled = input.subscribe({ maxBufferedMs: 2 })
    const live = new AbortController()
    const liveSamples = readAll(input.subscribe({ signal: live.signal }))
    mic.write(0, [1, 2])
    mic.write(2, [3])
    mic.write(3, [4])
    await expect.poll(() => input.position?.frame).toBe(4)
    live.abort()

    await expect(readAll(stalled)).rejects.toThrow('Audio subscriber fell behind')
    expect(await liveSamples).toEqual([1, 2, 3, 4])
  })
})

describe('capture', () => {
  it('seals one capture while another capture on the same input continues', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source)
    const first = capture(input)
    const second = capture(input)
    const firstSamples = readAll(first.stream)
    const secondSamples = readAll(second.stream)
    mic.write(0, [1, 2])
    await first.started

    expect(await first.finish()).toEqual({ status: 'finished', value: { sourceId: 'mic', startFrame: 0, endFrame: 2 } })
    mic.write(2, [3])
    await expect.poll(() => input.position?.frame).toBe(3)
    expect((await second.finish()).status).toBe('finished')

    expect(await firstSamples).toEqual([1, 2])
    expect(await secondSamples).toEqual([1, 2, 3])
  })

  it('fails when the source skips frames inside the captured interval', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source)
    const recording = capture(input)
    void readAll(recording.stream).catch(() => {})
    mic.write(0, [1])
    mic.write(4, [2])

    expect(await recording.done).toMatchObject({ status: 'failed', error: new Error('Audio source has a gap') })
  })

  it('reports no start and no interval when it ends before any audio', async () => {
    const mic = pushSource()
    const recording = capture(new AudioInput(mic.source))

    expect(await recording.finish()).toEqual({ status: 'finished', value: undefined })
    expect(await recording.started).toBe(false)
  })

  it('fails instead of queueing without limit when its stream is not read', async () => {
    const mic = pushSource()
    const recording = capture(new AudioInput(mic.source), { maxBufferedMs: 2 })
    mic.write(0, [1, 2])
    mic.write(2, [3])
    mic.write(3, [4])

    expect(await recording.done).toMatchObject({ status: 'failed', error: new Error('Capture reader fell behind') })
  })

  it('finishes when the source ends', async () => {
    const mic = pushSource()
    const recording = capture(new AudioInput(mic.source))
    const samples = readAll(recording.stream)
    mic.write(0, [1])
    mic.end()

    expect((await recording.done).status).toBe('finished')
    expect(await samples).toEqual([1])
  })
})

describe('observe', () => {
  it('retains pre-roll while ordered detection is still processing its window', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source, { historyMs: 0 })
    const detection = Promise.withResolvers<void>()
    let onset: ReturnType<typeof capture> | undefined
    const observer = observe(input, { windowMs: 32, hopMs: 32, scheduling: 'ordered', preRollMs: 360 }, async (window) => {
      if (window.range.startFrame === 384) {
        await detection.promise
        onset = capture(input, { from: { sourceId: 'mic', frame: 24 } })
      }
    }, () => {})
    mic.write(0, Array.from<number>({ length: 416 }).fill(0))
    mic.write(416, Array.from<number>({ length: 1584 }).fill(0))
    await expect.poll(() => input.position?.frame).toBe(2000)
    detection.resolve()

    await expect.poll(() => !!onset).toBe(true)
    const samples = readAll(onset!.stream)
    expect((await onset!.finish()).status).toBe('finished')
    expect(await samples).toHaveLength(2000 - 24)
    observer.cancel('Test finished')
  })

  it('keeps the gap flag when latest scheduling replaces the first window after that gap', async () => {
    const mic = pushSource()
    const input = new AudioInput(mic.source)
    const first = Promise.withResolvers<void>()
    const calls: { start: number, gap: boolean }[] = []
    const observer = observe(input, { windowMs: 2, hopMs: 2, scheduling: 'latest' }, async (window) => {
      calls.push({ start: window.range.startFrame, gap: window.discontinuity })
      if (calls.length === 1)
        await first.promise
    }, () => {})
    mic.write(0, [0, 0])
    await expect.poll(() => calls.length).toBe(1)
    mic.write(8, [0, 0, 0, 0])
    await expect.poll(() => input.position?.frame).toBe(12)
    first.resolve()

    await expect.poll(() => calls.length).toBe(2)
    expect(calls).toEqual([{ start: 0, gap: false }, { start: 10, gap: true }])
    observer.cancel('Test finished')
  })

  it('grows the first detector windows before switching to a sliding window', async () => {
    const mic = pushSource()
    const windows: number[][] = []
    const observer = observe(new AudioInput(mic.source), { minWindowMs: 2, windowMs: 4, hopMs: 1, scheduling: 'ordered' }, async (window) => {
      windows.push(Array.from(window.channels[0]))
    }, () => {})
    mic.write(0, [1, 2, 3, 4, 5])

    await expect.poll(() => windows).toEqual([[1, 2], [1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]])
    observer.cancel('Test finished')
  })

  it('publishes no result after cancellation, even when inference ignores abort', async () => {
    const mic = pushSource()
    const inFlight = Promise.withResolvers<number>()
    const results: number[] = []
    const observer = observe(new AudioInput(mic.source), { windowMs: 2, hopMs: 2, scheduling: 'ordered' }, () => inFlight.promise, result => results.push(result.value))
    mic.write(0, [0, 0])
    await Promise.resolve()
    observer.cancel('Detector disabled')
    inFlight.resolve(1)

    expect(await observer.done).toEqual({ status: 'cancelled', reason: 'Detector disabled' })
    await Promise.resolve()
    expect(results).toEqual([])
  })
})

describe('observe completion', () => {
  it('finishes after the source ends and the last window has been processed', async () => {
    const mic = pushSource()
    const seen: number[] = []
    const observer = observe(new AudioInput(mic.source), { windowMs: 2, hopMs: 2, scheduling: 'ordered' }, async window => window.range.startFrame, result => seen.push(result.value))
    mic.write(0, [0, 0, 0, 0])
    mic.end()

    expect(await observer.done).toEqual({ status: 'finished', value: undefined })
    expect(seen).toEqual([0, 2])
  })

  it('fails when ordered windows wait for more audio than the limit', async () => {
    const mic = pushSource()
    const observer = observe(new AudioInput(mic.source), { windowMs: 2, hopMs: 2, scheduling: 'ordered', maxBufferedMs: 4 }, () => new Promise(() => {}), () => {})
    mic.write(0, Array.from<number>({ length: 10 }).fill(0))

    expect(await observer.done).toMatchObject({ status: 'failed', error: new Error('Audio detector fell behind') })
  })
})

describe('createScope', () => {
  it('closes children first, then runs its own cleanups once in reverse order', async () => {
    const parent = new AbortController()
    const scope = createScope(parent.signal)
    const child = scope.child()
    const order: string[] = []
    scope.defer(() => order.push('first'))
    scope.defer(() => order.push('second'))
    child.defer(() => order.push('child'))
    parent.abort('Stopped')
    await scope.closed
    await child.closed
    await scope.close()

    expect(order).toEqual(['child', 'second', 'first'])
    expect(child.signal.reason).toBe('Stopped')
  })
})
