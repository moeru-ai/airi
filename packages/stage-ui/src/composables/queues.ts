import type { Emotion } from '../constants/emotions'
import type { UseQueueReturn } from './queue'

import { sleep } from '@moeru/std'

import { EMOTION_VALUES } from '../constants/emotions'
import { createControllableStream } from '../utils/stream'
import { chunkToTTSQueue } from '../utils/tts'
import { useQueue } from './queue'

export function useEmotionsMessageQueue(emotionsQueue: UseQueueReturn<Emotion>) {
  function splitEmotion(content: string) {
    for (const emotion of EMOTION_VALUES) {
      // doesn't include the emotion, continue
      if (!content.includes(emotion))
        continue

      return {
        ok: true,
        emotion: emotion as Emotion,
      }
    }

    return {
      ok: false,
      emotion: '' as Emotion,
    }
  }

  return useQueue<string>({
    handlers: [
      async (ctx) => {
        // if the message is an emotion, push the last content to the message queue
        if (EMOTION_VALUES.includes(ctx.data as Emotion)) {
          ctx.emit('emotion', ctx.data as Emotion)
          await emotionsQueue.add(ctx.data as Emotion)

          return
        }

        // otherwise we should process the message to find the emotions
        {
        // iterate through the message to find the emotions
          const { ok, emotion } = splitEmotion(ctx.data)
          if (ok) {
            ctx.emit('emotion', emotion)
            await emotionsQueue.add(emotion)
          }
        }
      },
    ],
  })
}

export function useDelayMessageQueue() {
  function splitDelays(content: string) {
    // doesn't include the delay, continue
    if (!(/<\|DELAY:\d+\|>/i.test(content))) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delayExecArray = /<\|DELAY:(\d+)\|>/i.exec(content)

    const delay = delayExecArray?.[1]
    if (!delay) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delaySeconds = Number.parseFloat(delay)

    if (delaySeconds <= 0 || Number.isNaN(delaySeconds)) {
      return {
        ok: true,
        delay: 0,
      }
    }

    return {
      ok: true,
      delay: delaySeconds,
    }
  }

  return useQueue<string>({
    handlers: [
      async (ctx) => {
        // iterate through the message to find the emotions
        const { ok, delay } = splitDelays(ctx.data)
        if (ok) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
        }
      },
    ],
  })
}

export function useMessageContentQueue(ttsQueue: UseQueueReturn<string>) {
  const encoder = new TextEncoder()
  const { stream, controller } = createControllableStream<Uint8Array>()

  chunkToTTSQueue(stream.getReader(), ttsQueue)

  return useQueue<string>({
    handlers: [
      async (ctx) => {
        controller.enqueue(encoder.encode(ctx.data))
      },
    ],
  })
}
