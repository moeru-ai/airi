import type { Emotion } from '../constants/emotions'
import { ref } from 'vue'

import { llmInferenceEndToken } from '../constants'
import { EMOTION_VALUES } from '../constants/emotions'
import { useQueue, type UseQueueReturn } from './queue'

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

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
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
  const processed = ref<string>('')

  return useQueue<string>({
    handlers: [
      async (ctx) => {
        if (ctx.data === llmInferenceEndToken) {
          const content = processed.value.trim()
          if (content)
            await ttsQueue.add(content)

          processed.value = ''
          return
        }

        const endMarker = /[.?!]/
        processed.value += ctx.data

        while (processed.value) {
          const endMarkerExecArray = endMarker.exec(processed.value)
          if (!endMarkerExecArray || typeof endMarkerExecArray.index === 'undefined')
            break

          const before = processed.value.slice(0, endMarkerExecArray.index + 1)
          const after = processed.value.slice(endMarkerExecArray.index + 1)

          await ttsQueue.add(before)
          processed.value = after
        }
      },
    ],
  })
}
