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
  const queue: QueuedItem<T>[] = []
  let nextIndex = 0

  return {
    async submit(index: number, request: TtsRequest, ttsFn: () => Promise<T | null>) {
      await semaphore.runExclusive(async () => {
        const audio = await ttsFn()
        if (!audio)
          return

        queue.push({ index, audio, request })

        while (queue.length > 0 && queue[0]!.index === nextIndex) {
          const item = queue.shift()!
          options.onComplete(item.index, item.audio, item.request)
          nextIndex++
        }
      })
    },
  }
}
