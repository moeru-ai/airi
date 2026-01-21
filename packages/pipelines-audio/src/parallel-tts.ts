import type { LoggerLike, TtsRequest } from './types'

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
  logger?: LoggerLike
  onComplete: (index: number, audio: T, request: TtsRequest) => void
}) {
  const logger = options.logger ?? console
  const semaphore = new Semaphore(options.concurrency)
  const buffer = new Map<number, QueuedItem<T>>()
  let nextIndex = 0

  async function tryFlush() {
    let flushed = 0
    while (buffer.has(nextIndex)) {
      const item = buffer.get(nextIndex)!
      buffer.delete(nextIndex)
      logger.info(`[ParallelTTS] 按序触发回调: index=${item.index}, text="${item.request.text.slice(0, 20)}..."`)
      options.onComplete(item.index, item.audio, item.request)
      nextIndex++
      flushed++
    }
    if (flushed > 0)
      logger.info(`[ParallelTTS] 刷新完成: 触发 ${flushed} 个回调, nextIndex=${nextIndex}, buffer.size=${buffer.size}`)
  }

  return {
    async submit(index: number, request: TtsRequest, ttsFn: () => Promise<T | null>) {
      logger.info(`[ParallelTTS] 等待信号量: index=${index}, text="${request.text.slice(0, 20)}..."`)
      const [, release] = await semaphore.acquire()
      try {
        logger.info(`[ParallelTTS] TTS 开始: index=${index}`)
        const audio = await ttsFn()
        if (!audio) {
          logger.info(`[ParallelTTS] TTS 返回空: index=${index}`)
          return
        }

        buffer.set(index, { index, audio, request })
        logger.info(`[ParallelTTS] TTS 完成: index=${index}, 等待 index=${nextIndex}, buffer.size=${buffer.size}`)

        await tryFlush()
      }
      finally {
        release()
        logger.info(`[ParallelTTS] 释放信号量: index=${index}`)
      }
    },
  }
}
