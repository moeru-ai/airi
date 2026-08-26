import type { PlaybackItem, TextSegment, TextToken, TtsRequest } from './types'

import { describe, expect, it, vi } from 'vitest'

import { createSpeechPipeline } from './speech-pipeline'

function createPlaybackSpy(options?: { autoEnd?: boolean }) {
  const scheduled: Array<PlaybackItem<string>> = []
  const endListeners: Array<(event: { endedAt: number, item: PlaybackItem<string> }) => void> = []
  const autoEnd = options?.autoEnd ?? true

  return {
    end(item: PlaybackItem<string>) {
      for (const listener of endListeners)
        listener({ endedAt: Date.now(), item })
    },
    playback: {
      onEnd(listener: (event: { endedAt: number, item: PlaybackItem<string> }) => void) {
        endListeners.push(listener)
      },
      onInterrupt: vi.fn(),
      onReject: vi.fn(),
      onStart: vi.fn(),
      schedule(item: PlaybackItem<string>) {
        scheduled.push(item)
        if (autoEnd)
          queueMicrotask(() => endListeners.forEach(listener => listener({ endedAt: Date.now(), item })))
      },
      stopAll: vi.fn(),
      stopByIntent: vi.fn(),
      stopByOwner: vi.fn(),
    },
    scheduled,
  }
}

function createSegmenter(texts: string[]) {
  return (_tokens: ReadableStream<TextToken>, meta: { intentId: string, streamId: string }) => {
    let index = 0

    return new ReadableStream<TextSegment>({
      pull(controller) {
        const text = texts[index]
        if (text == null) {
          controller.close()
          return
        }

        controller.enqueue({
          createdAt: Date.now(),
          intentId: meta.intentId,
          reason: 'flush',
          segmentId: `${meta.streamId}:${index}`,
          special: null,
          streamId: meta.streamId,
          text,
        })
        index += 1
      },
    })
  }
}

function deferred<T>() {
  let resolve!: (value: PromiseLike<T> | T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    reject,
    resolve,
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('createSpeechPipeline', () => {
  it('preserves playback order when TTS completes out of order', async () => {
    const { playback, scheduled } = createPlaybackSpy()

    const pipeline = createSpeechPipeline<string>({
      playback,
      segmenter: createSegmenter(['first', 'second', 'third']),
      async tts(request) {
        if (request.sequence === 0)
          await delay(30)
        else if (request.sequence === 1)
          await delay(5)

        return request.text
      },
      ttsMaxConcurrent: 2,
    })

    const intentFinished = new Promise<void>((resolve) => {
      pipeline.on('onIntentEnd', () => resolve())
    })

    const intent = pipeline.openIntent()
    intent.end()

    await intentFinished

    expect(scheduled.map(item => item.sequence)).toEqual([0, 1, 2])
    expect(scheduled.map(item => item.text)).toEqual(['first', 'second', 'third'])
  })

  it('prefetches TTS requests up to the configured concurrency', async () => {
    const { playback } = createPlaybackSpy()
    const startedRequests: number[] = []
    const pendingRequests = [
      deferred<string>(),
      deferred<string>(),
      deferred<string>(),
    ]
    let inFlight = 0
    let maxInFlight = 0

    const pipeline = createSpeechPipeline<string>({
      playback,
      segmenter: createSegmenter(['alpha', 'beta', 'gamma']),
      async tts(request: TtsRequest) {
        startedRequests.push(request.sequence)
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)

        try {
          return await pendingRequests[request.sequence]!.promise
        }
        finally {
          inFlight -= 1
        }
      },
      ttsMaxConcurrent: 2,
    })

    const intentFinished = new Promise<void>((resolve) => {
      pipeline.on('onIntentEnd', () => resolve())
    })

    const intent = pipeline.openIntent()
    intent.end()

    await delay(0)

    expect(startedRequests).toEqual([0, 1])
    expect(maxInFlight).toBe(2)

    pendingRequests[0]!.resolve('alpha')
    pendingRequests[1]!.resolve('beta')
    await delay(0)

    expect(startedRequests).toEqual([0, 1, 2])

    pendingRequests[2]!.resolve('gamma')
    await intentFinished

    expect(maxInFlight).toBe(2)
  })

  it('cancels in-flight TTS work without scheduling stale playback', async () => {
    const { playback, scheduled } = createPlaybackSpy()
    const abortedRequests: number[] = []

    const pipeline = createSpeechPipeline<string>({
      playback,
      segmenter: createSegmenter(['left', 'right']),
      tts(request, signal) {
        return new Promise<null | string>((resolve) => {
          signal.addEventListener('abort', () => {
            abortedRequests.push(request.sequence)
            resolve(null)
          }, { once: true })
        })
      },
      ttsMaxConcurrent: 2,
    })

    const intentCanceled = new Promise<void>((resolve) => {
      pipeline.on('onIntentCancel', () => resolve())
    })

    const intent = pipeline.openIntent()
    intent.end()

    await delay(0)
    intent.cancel('test-cancel')
    await intentCanceled

    expect(abortedRequests.sort()).toEqual([0, 1])
    expect(scheduled).toEqual([])
  })

  it('dispatches special controls only after the preceding playback item ends', async () => {
    const { end, playback, scheduled } = createPlaybackSpy({ autoEnd: false })
    const events: string[] = []

    const pipeline = createSpeechPipeline<string>({
      playback,
      segmenter: (_tokens, meta) => {
        return new ReadableStream<TextSegment>({
          start(controller) {
            controller.enqueue({
              createdAt: Date.now(),
              intentId: meta.intentId,
              reason: 'flush',
              segmentId: 'segment:0',
              special: null,
              streamId: meta.streamId,
              text: 'before',
              turnId: meta.turnId,
            })
            controller.enqueue({
              createdAt: Date.now(),
              intentId: meta.intentId,
              reason: 'special',
              segmentId: 'segment:1',
              special: '<|CALL ["plugin.action"]|>',
              streamId: meta.streamId,
              text: '',
              turnId: meta.turnId,
            })
            controller.close()
          },
        })
      },
      async tts(request) {
        events.push(`tts:${request.text}`)
        return request.text
      },
      ttsMaxConcurrent: 2,
    })

    pipeline.on('onSpecial', (segment) => {
      events.push(`special:${segment.special}`)
      events.push(`turn:${segment.turnId}`)
    })

    const intent = pipeline.openIntent({ turnId: 'turn-1' })
    intent.end()

    await delay(0)
    expect(scheduled.map(item => item.text)).toEqual(['before'])
    expect(events).toEqual(['tts:before'])

    end(scheduled[0]!)
    await delay(0)

    expect(events).toEqual([
      'tts:before',
      'special:<|CALL ["plugin.action"]|>',
      'turn:turn-1',
    ])
  })

  it('does not schedule queued timeline playback after the owning intent is cancelled', async () => {
    const { end, playback, scheduled } = createPlaybackSpy({ autoEnd: false })

    const pipeline = createSpeechPipeline<string>({
      playback,
      segmenter: (_tokens, meta) => {
        return new ReadableStream<TextSegment>({
          start(controller) {
            controller.enqueue({
              createdAt: Date.now(),
              intentId: meta.intentId,
              reason: 'flush',
              segmentId: 'segment:0',
              special: null,
              streamId: meta.streamId,
              text: 'first',
              turnId: meta.turnId,
            })
            controller.enqueue({
              createdAt: Date.now(),
              intentId: meta.intentId,
              reason: 'flush',
              segmentId: 'segment:1',
              special: null,
              streamId: meta.streamId,
              text: 'second',
              turnId: meta.turnId,
            })
            controller.close()
          },
        })
      },
      async tts(request) {
        return request.text
      },
      ttsMaxConcurrent: 2,
    })

    const intent = pipeline.openIntent({ intentId: 'intent-1', turnId: 'turn-1' })
    intent.end()

    await delay(0)
    expect(scheduled.map(item => item.text)).toEqual(['first'])

    intent.cancel('newer-intent')
    end(scheduled[0]!)
    await delay(0)

    expect(scheduled.map(item => item.text)).toEqual(['first'])
  })
})
