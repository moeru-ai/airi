import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { Emotion } from '../constants/emotions'

import { sleep } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { EMOTION_VALUES } from '../constants/emotions'

export function useEmotionsMessageQueue(emotionsQueue: UseQueueReturn<Emotion>) {
  function splitEmotion(content: string) {
    for (const emotion of EMOTION_VALUES) {
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

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        if (EMOTION_VALUES.includes(ctx.data as Emotion)) {
          ctx.emit('emotion', ctx.data as Emotion)
          emotionsQueue.enqueue(ctx.data as Emotion)
          return
        }

        {
          const { ok, emotion } = splitEmotion(ctx.data)
          if (ok) {
            ctx.emit('emotion', emotion)
            emotionsQueue.enqueue(emotion)
          }
        }
      },
    ],
  })
}

export function useDelayMessageQueue() {
  function splitDelays(content: string) {
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

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        const { ok, delay } = splitDelays(ctx.data)
        if (ok) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
        }
      },
    ],
  })
}
