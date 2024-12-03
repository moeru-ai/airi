import type { Emotion } from '../constants/emotions'
import { ref } from 'vue'

import { llmInferenceEndToken } from '../constants'
import { EMOTION_VALUES } from '../constants/emotions'
import { useQueue } from './queue'

export function useEmotionsMessageQueue(emotionsQueue: ReturnType<typeof useQueue<Emotion>>, messageContentQueue: ReturnType<typeof useQueue<string>>) {
  function splitEmotion(content: string) {
    for (const emotion of EMOTION_VALUES) {
      // doesn't include the emotion, continue
      if (!content.includes(emotion))
        continue

      // find the emotion and push the content before the emotion to the queue
      const emotionIndex = content.indexOf(emotion)
      const beforeEmotion = content.slice(0, emotionIndex)
      const afterEmotion = content.slice(emotionIndex + emotion.length)

      return {
        ok: true,
        emotion: emotion as Emotion,
        before: beforeEmotion,
        after: afterEmotion,
      }
    }

    return {
      ok: false,
      emotion: '' as Emotion,
      before: content,
      after: '',
    }
  }

  const processed = ref<string>('')

  return useQueue<string>({
    handlers: [
      async (ctx) => {
        // inference ended, push the last content to the message queue
        if (ctx.data.includes(llmInferenceEndToken)) {
          const content = processed.value.trim()
          if (content)
            await messageContentQueue.add(content)

          processed.value = ''

          return
        }
        // if the message is an emotion, push the last content to the message queue
        if (EMOTION_VALUES.includes(ctx.data as Emotion)) {
          const content = processed.value.trim()
          if (content)
            await messageContentQueue.add(content)

          processed.value = ''
          ctx.emit('emotion', ctx.data as Emotion)
          await emotionsQueue.add(ctx.data as Emotion)

          return
        }

        // otherwise we should process the message to find the emotions

        {
        // iterate through the message to find the emotions
          const { ok, before, emotion, after } = splitEmotion(ctx.data)
          if (ok) {
            await messageContentQueue.add(before)
            ctx.emit('emotion', emotion)
            await emotionsQueue.add(emotion)
            await messageContentQueue.add(after)
            processed.value = ''

            return
          }
          else {
            // if none of the emotions are found, push the content to the temp queue
            processed.value += ctx.data
          }
        }

        // iterate through the message to find the emotions
        {
          const { ok, before, emotion, after } = splitEmotion(processed.value)
          if (ok) {
            await messageContentQueue.add(before)
            ctx.emit('emotion', emotion)
            await emotionsQueue.add(emotion)
            await messageContentQueue.add(after)
            processed.value = ''
          }
        }
      },
    ],
  })
}

export function useDelayMessageQueue(useEmotionsMessageQueue: ReturnType<typeof useQueue<string>>) {
  function splitDelays(content: string) {
    // doesn't include the emotion, continue
    if (!(/<\|DELAY:\d+\|>/i.test(content))) {
      return {
        ok: false,
        delay: 0,
        before: content,
        after: '',
      }
    }

    const delayExecArray = /<\|DELAY:(\d+)\|>/i.exec(content)

    const delay = delayExecArray?.[1]
    if (!delay) {
      return {
        ok: false,
        delay: 0,
        before: content,
        after: '',
      }
    }

    const delaySeconds = Number.parseFloat(delay)
    const before = content.split(delayExecArray[0])[0]
    const after = content.split(delayExecArray[0])[1]

    if (delaySeconds <= 0 || Number.isNaN(delaySeconds)) {
      return {
        ok: true,
        delay: 0,
        before,
        after,
      }
    }

    return {
      ok: true,
      delay: delaySeconds,
      before,
      after,
    }
  }

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  const delaysQueueProcessedTemp = ref<string>('')
  return useQueue<string>({
    handlers: [
      async (ctx) => {
        // inference ended, push the last content to the message queue
        if (ctx.data.includes(llmInferenceEndToken)) {
          const content = delaysQueueProcessedTemp.value.trim()
          if (content)
            await useEmotionsMessageQueue.add(content)

          delaysQueueProcessedTemp.value = ''
          return
        }

        {
          // iterate through the message to find the emotions
          const { ok, before, delay, after } = splitDelays(ctx.data)
          if (ok && before) {
            await useEmotionsMessageQueue.add(before)

            if (delay) {
              ctx.emit('delay', delay)
              await sleep(delay * 1000)
            }

            if (after)
              await useEmotionsMessageQueue.add(after)
          }
          else {
            // if none of the emotions are found, push the content to the temp queue
            delaysQueueProcessedTemp.value += ctx.data
          }
        }

        // iterate through the message to find the emotions
        {
          const { ok, before, delay, after } = splitDelays(delaysQueueProcessedTemp.value)
          if (ok && before) {
            await useEmotionsMessageQueue.add(before)

            if (delay) {
              ctx.emit('delay', delay)
              await sleep(delay * 1000)
            }

            if (after)
              await useEmotionsMessageQueue.add(after)
            delaysQueueProcessedTemp.value = ''
          }
        }
      },
    ],
  })
}

export function useMessageContentQueue(ttsQueue: ReturnType<typeof useQueue<string>>) {
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
