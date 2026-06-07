import type { BackgroundRemovalRequest, BackgroundRemovalResult, KokoroGenerateChunk, LoadStreamItem, ModelReadyInfo, WhisperTranscribeItem } from './contract'
import type { ProgressPayload } from './protocol'

import { createContext, defineInvoke, defineInvokeHandler, defineStreamInvoke, defineStreamInvokeHandler } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  backgroundRemovalLoadEvent,
  backgroundRemovalProcessEvent,
  consumeLoadStream,
  createIdleTimeout,
  kokoroGenerateEvent,
  kokoroLoadEvent,
  kokoroUnloadEvent,
  signalWithTimeout,
  whisperLoadEvent,
  whisperTranscribeEvent,
} from './contract'

function streamOf<T>(items: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const item of items)
        controller.enqueue(item)
      controller.close()
    },
  })
}

describe('consumeLoadStream', () => {
  it('should forward progress items in order and resolve with the ready info', async () => {
    const progressed: ProgressPayload[] = []
    const ready: ModelReadyInfo = { device: 'webgpu', metadata: { voices: ['af_heart'] } }

    const info = await consumeLoadStream(
      streamOf<LoadStreamItem>([
        { kind: 'progress', payload: { phase: 'download', percent: 10 } },
        { kind: 'progress', payload: { phase: 'compile', percent: 80 } },
        { kind: 'ready', info: ready },
      ]),
      p => progressed.push(p),
    )

    expect(progressed).toHaveLength(2)
    expect(progressed[0].phase).toBe('download')
    expect(progressed[0].percent).toBe(10)
    expect(progressed[1].phase).toBe('compile')
    expect(progressed[1].percent).toBe(80)
    expect(info).toEqual(ready)
    expect(info.device).toBe('webgpu')
  })

  it('should resolve without invoking onProgress when there are no progress items', async () => {
    const onProgress = vi.fn()

    const info = await consumeLoadStream(
      streamOf<LoadStreamItem>([{ kind: 'ready', info: { device: 'wasm' } }]),
      onProgress,
    )

    expect(onProgress).not.toHaveBeenCalled()
    expect(info.device).toBe('wasm')
    expect(info.metadata).toBeUndefined()
  })

  it('should tolerate a missing onProgress callback', async () => {
    const info = await consumeLoadStream(
      streamOf<LoadStreamItem>([
        { kind: 'progress', payload: { phase: 'warmup', percent: -1 } },
        { kind: 'ready', info: { device: 'cpu' } },
      ]),
    )

    expect(info.device).toBe('cpu')
  })

  it('should throw when the stream ends without a ready item', async () => {
    await expect(consumeLoadStream(
      streamOf<LoadStreamItem>([
        { kind: 'progress', payload: { phase: 'download', percent: 50 } },
      ]),
    )).rejects.toThrow('model load stream ended without a ready signal')
  })

  it('should throw on an empty stream', async () => {
    await expect(consumeLoadStream(streamOf<LoadStreamItem>([])))
      .rejects
      .toThrow('model load stream ended without a ready signal')
  })
})

describe('signalWithTimeout', () => {
  it('should return the caller signal unchanged when the timeout is not finite', () => {
    const controller = new AbortController()
    expect(signalWithTimeout(controller.signal, Number.POSITIVE_INFINITY)).toBe(controller.signal)
    expect(signalWithTimeout(controller.signal, Number.NaN)).toBe(controller.signal)
  })

  it('should return a non-aborted signal when there is no caller signal and no finite timeout', () => {
    const signal = signalWithTimeout(undefined, Number.POSITIVE_INFINITY)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('should combine the caller signal with a finite timeout into a fresh signal', () => {
    const controller = new AbortController()
    const combined = signalWithTimeout(controller.signal, 10_000)

    expect(combined).not.toBe(controller.signal)
    expect(combined.aborted).toBe(false)
  })

  it('should abort the combined signal when the caller signal aborts', () => {
    const controller = new AbortController()
    const combined = signalWithTimeout(controller.signal, 10_000)

    controller.abort(new Error('caller cancelled'))

    expect(combined.aborted).toBe(true)
    expect((combined.reason as Error).message).toBe('caller cancelled')
  })

  it('should propagate an already-aborted caller signal immediately', () => {
    const controller = new AbortController()
    controller.abort(new Error('already gone'))

    const combined = signalWithTimeout(controller.signal, 10_000)

    expect(combined.aborted).toBe(true)
  })

  it('should abort with a TimeoutError once the timeout elapses', async () => {
    // Real timers: AbortSignal.timeout schedules on the platform timer, which
    // vitest fake timers do not drive, so a short real delay is used instead.
    const combined = signalWithTimeout(undefined, 5)

    await vi.waitFor(() => expect(combined.aborted).toBe(true))
    expect((combined.reason as Error).name).toBe('TimeoutError')
  })
})

describe('createIdleTimeout', () => {
  // createIdleTimeout uses setTimeout (not AbortSignal.timeout), so vitest fake
  // timers drive it deterministically.
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should abort with a TimeoutError after the first-output budget when no chunk arrives', () => {
    const idle = createIdleTimeout(30_000, 10_000)

    expect(idle.signal.aborted).toBe(false)
    vi.advanceTimersByTime(29_999)
    expect(idle.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(idle.signal.aborted).toBe(true)
    expect((idle.signal.reason as Error).name).toBe('TimeoutError')
    // The message reports whichever window tripped — here the first-output one.
    expect((idle.signal.reason as Error).message).toContain('30000ms')
  })

  it('should switch from the first-output budget to the tighter inter-chunk budget on the first reset', () => {
    const idle = createIdleTimeout(30_000, 10_000)

    // A first chunk arrives well within the 30s first-output budget.
    vi.advanceTimersByTime(5_000)
    idle.reset()

    // The 30s budget no longer applies; only the 10s inter-chunk gap does.
    vi.advanceTimersByTime(9_999)
    expect(idle.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(idle.signal.aborted).toBe(true)
    expect((idle.signal.reason as Error).message).toContain('10000ms')
  })

  it('should re-arm the inter-chunk window on every reset so a steady stream never trips', () => {
    const idle = createIdleTimeout(30_000, 10_000)

    // Chunks keep arriving with 9s gaps — always under the 10s inter-chunk budget.
    for (let i = 0; i < 5; i++) {
      idle.reset()
      vi.advanceTimersByTime(9_000)
    }

    expect(idle.signal.aborted).toBe(false)
  })

  it('should not abort after clear()', () => {
    const idle = createIdleTimeout(30_000, 10_000)

    idle.clear()
    vi.advanceTimersByTime(60_000)

    expect(idle.signal.aborted).toBe(false)
  })

  it('should not re-arm once aborted', () => {
    const idle = createIdleTimeout(10_000, 5_000)

    vi.advanceTimersByTime(10_000)
    expect(idle.signal.aborted).toBe(true)

    // A reset() after the terminal abort must be a no-op: the signal stays
    // aborted and no new timer fires.
    idle.reset()
    vi.advanceTimersByTime(60_000)
    expect(idle.signal.aborted).toBe(true)
  })
})

// In-memory round-trips exercise the event definitions against the same
// invoke/stream primitives the worker and main adapters use, without a real
// Web Worker transport. createContext() wires handler and client on one ctx.
describe('kokoro event contract', () => {
  it('should stream load progress then a ready signal that consumeLoadStream drains', async () => {
    const ctx = createContext()

    defineStreamInvokeHandler(ctx, kokoroLoadEvent, async function* (request) {
      yield { kind: 'progress', payload: { phase: 'download', percent: 50 } } satisfies LoadStreamItem
      yield {
        kind: 'ready',
        info: { device: request.device, metadata: { dtype: request.dtype } },
      } satisfies LoadStreamItem
    })

    const invokeLoad = defineStreamInvoke(ctx, kokoroLoadEvent)

    const progressed: ProgressPayload[] = []
    const info = await consumeLoadStream(
      invokeLoad({ device: 'webgpu', dtype: 'q4' }),
      p => progressed.push(p),
    )

    expect(progressed).toHaveLength(1)
    expect(progressed[0].percent).toBe(50)
    expect(info.device).toBe('webgpu')
    expect(info.metadata).toEqual({ dtype: 'q4' })
  })

  it('should stream generate audio chunks segment-by-segment', async () => {
    const ctx = createContext()

    defineStreamInvokeHandler(ctx, kokoroGenerateEvent, async function* (request) {
      expect(request.text).toBe('hello')
      expect(request.voice).toBe('af_heart')
      yield { samples: new Float32Array([0.1, 0.2]), samplingRate: 24_000 } satisfies KokoroGenerateChunk
      yield { samples: new Float32Array([0.3]), samplingRate: 24_000 } satisfies KokoroGenerateChunk
    })

    const generate = defineStreamInvoke(ctx, kokoroGenerateEvent)

    const samples: number[] = []
    let samplingRate = 0
    for await (const chunk of generate({ text: 'hello', voice: 'af_heart' as never })) {
      samples.push(...chunk.samples)
      samplingRate = chunk.samplingRate
    }

    expect(samples).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ])
    expect(samplingRate).toBe(24_000)
  })

  it('should round-trip a void unload invoke', async () => {
    const ctx = createContext()
    const onUnload = vi.fn()

    defineInvokeHandler(ctx, kokoroUnloadEvent, () => {
      onUnload()
    })

    const unload = defineInvoke(ctx, kokoroUnloadEvent)
    await expect(unload(undefined)).resolves.toBeUndefined()
    expect(onUnload).toHaveBeenCalledTimes(1)
  })
})

// Whisper load mirrors the shared load stream; transcribe is its own
// server-streaming shape where per-token progress (carrying the worker's
// `output` / `tps` / `numTokens` extras) precedes a terminal `result` item.
describe('whisper event contract', () => {
  it('should stream load progress then a ready signal that consumeLoadStream drains', async () => {
    const ctx = createContext()

    defineStreamInvokeHandler(ctx, whisperLoadEvent, async function* (request) {
      yield { kind: 'progress', payload: { phase: 'download', percent: 0, message: 'Loading model...' } } satisfies LoadStreamItem
      yield { kind: 'ready', info: { device: request.device } } satisfies LoadStreamItem
    })

    const invokeLoad = defineStreamInvoke(ctx, whisperLoadEvent)

    const progressed: ProgressPayload[] = []
    const info = await consumeLoadStream(
      invokeLoad({ device: 'wasm' }),
      p => progressed.push(p),
    )

    expect(progressed).toHaveLength(1)
    expect(progressed[0].phase).toBe('download')
    expect(progressed[0].message).toBe('Loading model...')
    expect(info.device).toBe('wasm')
  })

  it('should stream per-token progress extras before the terminal result text', async () => {
    const ctx = createContext()

    defineStreamInvokeHandler(ctx, whisperTranscribeEvent, async function* (request) {
      expect(request.language).toBe('en')
      yield { kind: 'progress', payload: { phase: 'inference', percent: -1, numTokens: 1 } } satisfies WhisperTranscribeItem
      yield { kind: 'progress', payload: { phase: 'inference', percent: -1, numTokens: 2, tps: 12.5 } } satisfies WhisperTranscribeItem
      yield { kind: 'result', text: ['hello world'] } satisfies WhisperTranscribeItem
    })

    const transcribe = defineStreamInvoke(ctx, whisperTranscribeEvent)

    const progressed: Array<ProgressPayload & Record<string, unknown>> = []
    let text: string[] = []
    for await (const item of transcribe({ audioFloat32: new Float32Array([0, 0.5, -0.5]), language: 'en' })) {
      if (item.kind === 'progress')
        progressed.push(item.payload)
      else
        text = item.text
    }

    expect(progressed).toHaveLength(2)
    expect(progressed[0].numTokens).toBe(1)
    expect(progressed[0].tps).toBeUndefined()
    expect(progressed[1].numTokens).toBe(2)
    expect(progressed[1].tps).toBe(12.5)
    expect(text).toEqual(['hello world'])
  })
})

describe('background removal event contract', () => {
  it('should stream load progress then a ready signal that consumeLoadStream drains', async () => {
    const ctx = createContext()

    defineStreamInvokeHandler(ctx, backgroundRemovalLoadEvent, async function* (request) {
      yield { kind: 'progress', payload: { phase: 'download', percent: 25 } } satisfies LoadStreamItem
      yield { kind: 'ready', info: { device: request.device } } satisfies LoadStreamItem
    })

    const invokeLoad = defineStreamInvoke(ctx, backgroundRemovalLoadEvent)

    const progressed: ProgressPayload[] = []
    const info = await consumeLoadStream(invokeLoad({ device: 'webgpu' }), p => progressed.push(p))

    expect(progressed).toHaveLength(1)
    expect(progressed[0].percent).toBe(25)
    expect(info.device).toBe('webgpu')
  })

  it('should round-trip a unary process request and its alpha mask result', async () => {
    const ctx = createContext()

    defineInvokeHandler(ctx, backgroundRemovalProcessEvent, ({ imageData, width, height }) => {
      expect(width).toBe(2)
      expect(height).toBe(1)
      // Two RGBA pixels in, one alpha-mask byte per pixel out.
      expect(Array.from(imageData)).toEqual([10, 20, 30, 255, 40, 50, 60, 255])
      return { maskData: new Uint8Array([0, 255]), width, height } satisfies BackgroundRemovalResult
    })

    const process = defineInvoke(ctx, backgroundRemovalProcessEvent)
    const request: BackgroundRemovalRequest = {
      imageData: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]),
      width: 2,
      height: 1,
    }
    const result = await process(request)

    expect(Array.from(result.maskData)).toEqual([0, 255])
    expect(result.width).toBe(2)
    expect(result.height).toBe(1)
  })
})
