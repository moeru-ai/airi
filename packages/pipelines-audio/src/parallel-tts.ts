import type { TtsRequest } from './types'

import { Semaphore } from 'async-mutex'

interface QueuedItem<T> {
  index: number
  audio: T
  request: TtsRequest
}

/**
 * Parallel TTS processor
 * Ensures events and callbacks are executed in order, even when TTS completes out of order
 */
export function createParallelTts<T>(options: {
  concurrency: number
  onComplete: (index: number, audio: T, request: TtsRequest) => void
}) {
  const semaphore = new Semaphore(options.concurrency)
  const buffer = new Map<number, QueuedItem<T>>()
  let nextIndex = 0

  function tryFlush() {
    while (buffer.has(nextIndex)) {
      const item = buffer.get(nextIndex)!
      buffer.delete(nextIndex)
      options.onComplete(item.index, item.audio, item.request)
      nextIndex++
    }
  }

  return {
    async submit(index: number, request: TtsRequest, ttsFn: () => Promise<T | null>) {
      const [, release] = await semaphore.acquire()
      try {
        const audio = await ttsFn()
        if (!audio) {
          return
        }

        buffer.set(index, { index, audio, request })
        tryFlush()
      }
      finally {
        release()
      }
    },
  }
}
