import type { LiveCapture, MediaAdapters, PcmBlock } from './index'

import { describe, expect, it, vi } from 'vitest'

import { AudioInput, createPushStream } from './index'

describe('audioInput', () => {
  it('retains requested pre-roll while ordered detection is still processing its window', async () => {
    const frames = createPushStream<PcmBlock>()
    const input = new AudioInput({ id: 'mic', frames: frames.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => { throw new Error('No codec') },
    }, { historyMs: 360 })
    const detection = Promise.withResolvers<void>()
    let captured: LiveCapture<ReadableStream<PcmBlock>> | undefined
    const observer = input.observe({ windowMs: 32, hopMs: 32, scheduling: 'ordered', preRollMs: 360 }, async (window) => {
      if (window.range.startFrame === 384) {
        await detection.promise
        captured = input.capture({ delivery: 'pcm', from: { sourceId: 'mic', frame: 24 } })
      }
    }, () => {})
    frames.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 416 }, sampleRate: 1000, channels: [new Float32Array(416)] })
    await expect.poll(() => input.position.frame).toBe(416)
    frames.write({ range: { sourceId: 'mic', startFrame: 416, endFrame: 2000 }, sampleRate: 1000, channels: [new Float32Array(1584)] })
    await expect.poll(() => input.position.frame).toBe(2000)
    detection.resolve()
    await expect.poll(() => !!captured).toBe(true)
    observer.cancel()
    expect((await captured!.finish()).status).toBe('finished')
    await input.close()
  })

  it('retains the source gap when latest scheduling replaces the first window after that gap', async () => {
    const source = createPushStream<PcmBlock>()
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => { throw new Error('No codec') },
    })
    const first = Promise.withResolvers<void>()
    const calls: { start: number, gap: boolean }[] = []
    input.observe({ windowMs: 2, hopMs: 2, scheduling: 'latest' }, async (window) => {
      calls.push({ start: window.range.startFrame, gap: window.discontinuity })
      if (calls.length === 1)
        await first.promise
    }, () => {})
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 1000, channels: [new Float32Array(2)] })
    await expect.poll(() => calls.length).toBe(1)
    source.write({ range: { sourceId: 'mic', startFrame: 8, endFrame: 12 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => input.position.frame).toBe(12)
    first.resolve()
    await expect.poll(() => calls.length).toBe(2)
    expect(calls).toEqual([{ start: 0, gap: false }, { start: 10, gap: true }])
    await input.close()
  })

  it('retains native capture as PCM until its consumer requests the media stream', async () => {
    const source = createPushStream<PcmBlock>()
    const delivered: number[] = []
    const nativeStream = vi.fn<NonNullable<MediaAdapters['nativeStream']>>(frames => ({
      media: {} as MediaStream,
      done: (async () => {
        for await (const block of frames) delivered.push(...block.channels[0])
      })(),
    }))
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { nativeStream, supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const capture = input.capture({ delivery: 'media-stream' })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 16000, channels: [new Float32Array([1, 2])] })
    await expect.poll(() => input.position.frame).toBe(2)
    expect(nativeStream).not.toHaveBeenCalled()
    expect(capture.media).toBeDefined()
    expect((await capture.finish()).status).toBe('finished')
    expect(delivered).toEqual([1, 2])
    await input.close()
  })

  it('keeps a sealed recording intact when its source fails during encoding', async () => {
    const source = createPushStream<PcmBlock>()
    const encoded = Promise.withResolvers<Blob>()
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => true, encode: () => encoded.promise })
    const capture = input.capture({ delivery: 'file', file: { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 16000, channels: [new Float32Array(2)] })
    await expect.poll(() => input.position.frame).toBe(2)
    const finished = capture.finish()
    source.error(new Error('Device unplugged'))
    await Promise.resolve()
    encoded.resolve(new Blob(['complete recording']))
    expect(await finished).toEqual({ status: 'finished', value: expect.any(Blob), range: { sourceId: 'mic', startFrame: 0, endFrame: 2 } })
    await input.close()
  })

  it('grows the first detector windows before switching to a sliding window', async () => {
    const source = createPushStream<PcmBlock>()
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, { supportsFile: () => false, encode: async () => {
      throw new Error('No codec')
    } })
    const windows: number[][] = []
    input.observe({ minWindowMs: 2, windowMs: 4, hopMs: 1, scheduling: 'ordered' }, async (window) => {
      windows.push(Array.from(window.channels[0]))
    }, () => {})
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 5 }, sampleRate: 1000, channels: [new Float32Array([1, 2, 3, 4, 5])] })
    await expect.poll(() => windows).toEqual([[1, 2], [1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]])
    await input.close()
  })

  it('preserves ordered windows across a gap and blocks results after observer cancellation', async () => {
    const source = createPushStream<PcmBlock>()
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    })
    const inFlight = Promise.withResolvers<number>()
    const calls: { start: number, gap: boolean }[] = []
    const results: number[] = []
    let signal: AbortSignal | undefined
    const observer = input.observe({ windowMs: 2, hopMs: 2, scheduling: 'ordered' }, async (window, currentSignal) => {
      calls.push({ start: window.range.startFrame, gap: window.discontinuity })
      signal = currentSignal
      return calls.length === 3 ? inFlight.promise : window.range.startFrame
    }, result => results.push(result.value))
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    source.write({ range: { sourceId: 'mic', startFrame: 8, endFrame: 10 }, sampleRate: 1000, channels: [new Float32Array(2)] })
    await expect.poll(() => calls.length).toBe(3)
    expect(calls).toEqual([{ start: 0, gap: false }, { start: 2, gap: false }, { start: 8, gap: true }])
    observer.cancel()
    inFlight.resolve(8)
    await observer.done
    expect(signal?.aborted).toBe(true)
    expect(results).toEqual([0, 2])
    await input.close()
  })

  it('keeps an active detector running and coalesces pending windows with latest scheduling', async () => {
    const source = createPushStream<PcmBlock>()
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    })
    const first = Promise.withResolvers<string>()
    const windows: number[][] = []
    const published: string[] = []
    const observer = input.observe({ windowMs: 2, hopMs: 1 }, async (window, signal) => {
      windows.push(Array.from(window.channels[0]))
      if (windows.length === 1) {
        const result = await first.promise
        expect(signal.aborted).toBe(false)
        return result
      }
      return 'latest'
    }, result => published.push(result.value))
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array([1, 2, 3, 4])] })
    await expect.poll(() => windows).toEqual([[1, 2]])
    first.resolve('first')
    await expect.poll(() => published).toEqual(['first', 'latest'])
    expect(windows).toEqual([[1, 2], [3, 4]])
    observer.cancel()
    expect(await observer.done).toEqual({ status: 'cancelled' })
    await input.close()
  })

  it('replays requested history exactly and rejects missing history without accepting new audio', async () => {
    const source = createPushStream<PcmBlock>()
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    }, { historyMs: 3 })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array([1, 2, 3, 4])] })
    await expect.poll(() => input.position.frame).toBe(4)
    const capture = input.capture({ delivery: 'pcm', from: { sourceId: 'mic', frame: 2 } })
    const reader = capture.media.getReader()
    const block = (await reader.read()).value
    expect(block?.range).toEqual({ sourceId: 'mic', startFrame: 2, endFrame: 4 })
    expect(Array.from(block?.channels[0] ?? [])).toEqual([3, 4])
    const missing = input.capture({ delivery: 'pcm', from: { sourceId: 'mic', frame: 0 } })
    expect((await missing.done).status).toBe('failed')
    const aborted = new AbortController()
    aborted.abort()
    const cancelled = input.capture({ delivery: 'pcm', signal: aborted.signal })
    expect((await cancelled.done).status).toBe('cancelled')
    await input.close()
  })

  it('lets encoding drain after finish but lets cancellation reject a late file result', async () => {
    const source = createPushStream<PcmBlock>()
    const encoded = Promise.withResolvers<Blob>()
    const drained = Promise.withResolvers<void>()
    let codecSignal: AbortSignal | undefined
    const input = new AudioInput({ id: 'mic', frames: source.stream, close: async () => {} }, {
      supportsFile: () => true,
      async encode(frames, _options, signal) {
        codecSignal = signal
        const reader = frames.getReader()
        while (!(await reader.read()).done) {
          // Consume all accepted frames before completing the external encoder.
        }
        reader.releaseLock()
        drained.resolve()
        return encoded.promise
      },
    })
    const capture = input.capture({ delivery: 'file', file: { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 } })
    const finishing = capture.finish()
    await drained.promise
    expect(codecSignal?.aborted).toBe(false)
    capture.cancel('Discard preview')
    expect(await finishing).toEqual({ status: 'cancelled', reason: 'Discard preview' })
    expect(codecSignal?.aborted).toBe(true)
    encoded.resolve(new Blob(['late file']))
    expect(await capture.done).toEqual({ status: 'cancelled', reason: 'Discard preview' })
    await input.close()
  })

  it('seals a PCM capture while another capture continues on the same source', async () => {
    const source = createPushStream<PcmBlock>()
    const close = vi.fn(async () => {})
    const adapters: MediaAdapters = {
      supportsFile: () => false,
      encode: async () => {
        throw new Error('No codec')
      },
    }
    const input = new AudioInput({ id: 'mic', frames: source.stream, close }, adapters)
    const first = input.capture({ delivery: 'pcm' })
    const second = input.capture({ delivery: 'pcm' })
    const firstReader = first.media.getReader()
    const secondReader = second.media.getReader()

    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 2 }, sampleRate: 16000, channels: [new Float32Array([0.1, 0.2])] })
    expect((await firstReader.read()).value?.range.endFrame).toBe(2)
    expect((await secondReader.read()).value?.range.endFrame).toBe(2)
    expect(await first.finish()).toEqual({ status: 'finished', value: undefined, range: { sourceId: 'mic', startFrame: 0, endFrame: 2 } })
    source.write({ range: { sourceId: 'mic', startFrame: 2, endFrame: 4 }, sampleRate: 16000, channels: [new Float32Array([0.3, 0.4])] })
    expect(await firstReader.read()).toEqual({ done: true, value: undefined })
    expect((await secondReader.read()).value?.range.endFrame).toBe(4)
    expect(close).not.toHaveBeenCalled()

    await secondReader.cancel('consumer stopped')
    expect(await second.done).toEqual({ status: 'cancelled', reason: 'consumer stopped' })
    await input.close()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
