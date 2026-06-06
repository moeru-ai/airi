import type { PlaybackItem, TextSegment, TextToken, TtsRequest } from './types'

import { describe, expect, it, vi } from 'vitest'

import { createSpeechPipeline } from './speech-pipeline'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function createSegmenter(texts: string[]) {
  return (_tokens: ReadableStream<TextToken>, meta: { streamId: string; intentId: string }) => {
    let index = 0

    return new ReadableStream<TextSegment>({
      pull(controller) {
        const text = texts[index]
        if (text == null) {
          controller.close()
          return
        }

        controller.enqueue({
          streamId: meta.streamId,
          intentId: meta.intentId,
          segmentId: `${meta.streamId}:${index}`,
          text,
          special: null,
          reason: 'flush',
          createdAt: Date.now(),
        })
        index += 1
      },
    })
  }
}

function createPlaybackSpy(options?: { autoEnd?: boolean }) {
  const scheduled: Array<PlaybackItem<string>> = []
  const endListeners: Array<(event: { item: PlaybackItem<string>; endedAt: number }) => void> = []
  const autoEnd = options?.autoEnd ?? true

  return {
    scheduled,
    end(item: PlaybackItem<string>) {
      for (const listener of endListeners) listener({ item, endedAt: Date.now() })
    },
    playback: {
      schedule(item: PlaybackItem<string>) {
        scheduled.push(item)
        if (autoEnd) queueMicrotask(() => endListeners.forEach((listener) => listener({ item, endedAt: Date.now() })))
      },
      stopAll: vi.fn(),
      stopByIntent: vi.fn(),
      stopByOwner: vi.fn(),
      onStart: vi.fn(),
      onEnd(listener: (event: { item: PlaybackItem<string>; endedAt: number }) => void) {
        endListeners.push(listener)
      },
      onInterrupt: vi.fn(),
      onReject: vi.fn(),
    },
  }
}

describe('createSpeechPipeline', () => {
  it('preserves playback order when TTS completes out of order', async () => {
    const { scheduled, playback } = createPlaybackSpy()

    const pipeline = createSpeechPipeline<string>({
      ttsMaxConcurrent: 2,
      segmenter: createSegmenter(['first', 'second', 'third']),
      playback,
      async tts(request) {
        if (request.sequence === 0) await delay(30)
        else if (request.sequence === 1) await delay(5)

        return request.text
      },
    })

    const intentFinished = new Promise<void>((resolve) => {
      pipeline.on('onIntentEnd', () => resolve())
    })

    const intent = pipeline.openIntent()
    intent.end()

    await intentFinished

    expect(scheduled.map((item) => item.sequence)).toEqual([0, 1, 2])
    expect(scheduled.map((item) => item.text)).toEqual(['first', 'second', 'third'])
  })

  it('prefetches TTS requests up to the configured concurrency', async () => {
    const { playback } = createPlaybackSpy()
    const startedRequests: number[] = []
    const pendingRequests = [deferred<string>(), deferred<string>(), deferred<string>()]
    let inFlight = 0
    let maxInFlight = 0

    const pipeline = createSpeechPipeline<string>({
      ttsMaxConcurrent: 2,
      segmenter: createSegmenter(['alpha', 'beta', 'gamma']),
      playback,
      async tts(request: TtsRequest) {
        startedRequests.push(request.sequence)
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)

        try {
          return await pendingRequests[request.sequence]!.promise
        } finally {
          inFlight -= 1
        }
      },
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
    const { scheduled, playback } = createPlaybackSpy()
    const abortedRequests: number[] = []

    const pipeline = createSpeechPipeline<string>({
      ttsMaxConcurrent: 2,
      segmenter: createSegmenter(['left', 'right']),
      playback,
      tts(request, signal) {
        return new Promise<string | null>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              abortedRequests.push(request.sequence)
              resolve(null)
            },
            { once: true },
          )
        })
      },
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
    const { scheduled, playback, end } = createPlaybackSpy({ autoEnd: false })
    const events: string[] = []

    const pipeline = createSpeechPipeline<string>({
      ttsMaxConcurrent: 2,
      segmenter: (_tokens, meta) => {
        return new ReadableStream<TextSegment>({
          start(controller) {
            controller.enqueue({
              turnId: meta.turnId,
              streamId: meta.streamId,
              intentId: meta.intentId,
              segmentId: 'segment:0',
              text: 'before',
              special: null,
              reason: 'flush',
              createdAt: Date.now(),
            })
            controller.enqueue({
              turnId: meta.turnId,
              streamId: meta.streamId,
              intentId: meta.intentId,
              segmentId: 'segment:1',
              text: '',
              special: '<|CALL ["plugin.action"]|>',
              reason: 'special',
              createdAt: Date.now(),
            })
            controller.close()
          },
        })
      },
      playback,
      async tts(request) {
        events.push(`tts:${request.text}`)
        return request.text
      },
    })

    pipeline.on('onSpecial', (segment) => {
      events.push(`special:${segment.special}`)
      events.push(`turn:${segment.turnId}`)
    })

    const intent = pipeline.openIntent({ turnId: 'turn-1' })
    intent.end()

    await delay(0)
    expect(scheduled.map((item) => item.text)).toEqual(['before'])
    expect(events).toEqual(['tts:before'])

    end(scheduled[0]!)
    await delay(0)

    expect(events).toEqual(['tts:before', 'special:<|CALL ["plugin.action"]|>', 'turn:turn-1'])
  })

  it('does not schedule queued timeline playback after the owning intent is cancelled', async () => {
    const { scheduled, playback, end } = createPlaybackSpy({ autoEnd: false })

    const pipeline = createSpeechPipeline<string>({
      ttsMaxConcurrent: 2,
      segmenter: (_tokens, meta) => {
        return new ReadableStream<TextSegment>({
          start(controller) {
            controller.enqueue({
              turnId: meta.turnId,
              streamId: meta.streamId,
              intentId: meta.intentId,
              segmentId: 'segment:0',
              text: 'first',
              special: null,
              reason: 'flush',
              createdAt: Date.now(),
            })
            controller.enqueue({
              turnId: meta.turnId,
              streamId: meta.streamId,
              intentId: meta.intentId,
              segmentId: 'segment:1',
              text: 'second',
              special: null,
              reason: 'flush',
              createdAt: Date.now(),
            })
            controller.close()
          },
        })
      },
      playback,
      async tts(request) {
        return request.text
      },
    })

    const intent = pipeline.openIntent({ intentId: 'intent-1', turnId: 'turn-1' })
    intent.end()

    await delay(0)
    expect(scheduled.map((item) => item.text)).toEqual(['first'])

    intent.cancel('newer-intent')
    end(scheduled[0]!)
    await delay(0)

    expect(scheduled.map((item) => item.text)).toEqual(['first'])
  })

  describe('stripMarkdown option', () => {
    /**
     * Helper: create a pipeline that captures TTS requests and uses the
     * default segmenter (so writeLiteral text actually flows through).
     */
    async function runStripMarkdownTest(
      texts: string[],
      options: { stripMarkdown?: boolean },
    ) {
      const ttsRequests: TtsRequest[] = []
      const { playback } = createPlaybackSpy()

      const pipeline = createSpeechPipeline<string>({
        ...options,
        playback,
        async tts(request) {
          ttsRequests.push(request)
          return request.text
        },
      })

      const intentFinished = new Promise<void>((resolve) => {
        pipeline.on('onIntentEnd', () => resolve())
      })

      const intent = pipeline.openIntent()
      for (const text of texts) {
        intent.writeLiteral(text)
      }
      intent.end()

      await intentFinished
      return ttsRequests
    }

    it('strips bold markers from writeLiteral text', async () => {
      const ttsRequests = await runStripMarkdownTest(
        ['Hello **world**!'],
        { stripMarkdown: true },
      )

      const texts = ttsRequests.map((r) => r.text)
      expect(texts.join('')).not.toContain('**')
      expect(texts.join('')).toContain('Hello')
      expect(texts.join('')).toContain('world')
    })

    it('strips bold markers split across writeLiteral calls', async () => {
      // Simulate **bold** split across two streaming chunks
      const ttsRequests = await runStripMarkdownTest(
        ['**bold', ' text**'],
        { stripMarkdown: true },
      )

      const texts = ttsRequests.map((r) => r.text)
      expect(texts.join('')).not.toContain('**')
      expect(texts.join('')).toContain('bold')
      expect(texts.join('')).toContain('text')
    })

    it('strips headings, links, and italic markers', async () => {
      const ttsRequests = await runStripMarkdownTest(
        ['## Heading', 'Check [link](url) out', 'Some *italic* text'],
        { stripMarkdown: true },
      )

      const fullText = ttsRequests.map((r) => r.text).join('')
      expect(fullText).not.toContain('##')
      expect(fullText).not.toContain('[')
      expect(fullText).not.toContain('*')
      expect(fullText).toContain('Heading')
      expect(fullText).toContain('link')
      expect(fullText).toContain('italic')
    })

    it('does not strip markdown when stripMarkdown is false', async () => {
      const ttsRequests = await runStripMarkdownTest(
        ['Hello **world**!'],
        { stripMarkdown: false },
      )

      const texts = ttsRequests.map((r) => r.text)
      expect(texts.join('')).toContain('**')
    })

    it('strips markdown by default when stripMarkdown is not specified', async () => {
      const ttsRequests = await runStripMarkdownTest(
        ['Hello **world**!'],
        {},
      )

      const texts = ttsRequests.map((r) => r.text)
      expect(texts.join('')).not.toContain('**')
    })
  })
})
