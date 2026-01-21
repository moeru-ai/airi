import type { TtsRequest } from './types'

import { Semaphore } from 'async-mutex'

interface QueuedItem<T> {
  index: number
  audio: T
  request: TtsRequest
}

/**
 * 并行 TTS 处理器
 * 确保事件发射和回调按顺序执行，即使 TTS 完成顺序是乱的
 */
export function createParallelTts<T>(options: {
  concurrency: number
  onComplete: (index: number, audio: T, request: TtsRequest) => void
}) {
  const semaphore = new Semaphore(options.concurrency)
  const buffer = new Map<number, QueuedItem<T>>()
  let nextIndex = 0

  async function tryFlush() {
    let flushed = 0
    while (buffer.has(nextIndex)) {
      const item = buffer.get(nextIndex)!
      buffer.delete(nextIndex)
      options.onComplete(item.index, item.audio, item.request)
      nextIndex++
      flushed++
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
        await tryFlush()
      }
      finally {
        release()
      }
    },
  }
}
