import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { Emotion, EmotionPayload } from '../constants/emotions'

import { sleep } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { EMOTION_VALUES } from '../constants/emotions'

export function useDelayMessageQueue() {
  function splitDelays(content: string) {
    if (!(/<\|DELAY:\d+\|>/i.test(content))) {
      return {
        delay: 0,
        ok: false,
      }
    }

    const delayExecArray = /<\|DELAY:(\d+)\|>/i.exec(content)

    const delay = delayExecArray?.[1]
    if (!delay) {
      return {
        delay: 0,
        ok: false,
      }
    }

    const delaySeconds = Number.parseFloat(delay)

    if (delaySeconds <= 0 || Number.isNaN(delaySeconds)) {
      return {
        delay: 0,
        ok: true,
      }
    }

    return {
      delay: delaySeconds,
      ok: true,
    }
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        const { delay, ok } = splitDelays(ctx.data)
        if (ok) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
        }
      },
    ],
  })
}

export function useEmotionsMessageQueue(emotionsQueue: UseQueueReturn<EmotionPayload>) {
  const normalizeEmotionName = (value: string): Emotion | null => {
    const normalized = value.trim().toLowerCase()
    if (EMOTION_VALUES.includes(normalized as Emotion))
      return normalized as Emotion
    return null
  }

  const normalizeIntensity = (value: unknown): number => {
    if (typeof value !== 'number' || Number.isNaN(value))
      return 1
    return Math.min(1, Math.max(0, value))
  }

  function parseActEmotion(content: string) {
    const match = /<\|ACT\s*(?::\s*)?(\{[\s\S]*\})\|>/i.exec(content)
    if (!match)
      return { emotion: null as EmotionPayload | null, ok: false }

    const payloadText = match[1]
    try {
      const payload = JSON.parse(payloadText) as { emotion?: unknown }
      const emotion = payload?.emotion
      if (typeof emotion === 'string') {
        const normalized = normalizeEmotionName(emotion)
        if (normalized)
          return { emotion: { intensity: 1, name: normalized }, ok: true }
      }
      else if (emotion && typeof emotion === 'object' && !Array.isArray(emotion)) {
        if ('name' in emotion && typeof (emotion as { name?: unknown }).name === 'string') {
          const normalized = normalizeEmotionName((emotion as { name: string }).name)
          if (normalized) {
            const intensity = normalizeIntensity((emotion as { intensity?: unknown }).intensity)
            return { emotion: { intensity, name: normalized }, ok: true }
          }
        }
      }
    }
    catch (e) {
      console.warn(`[parseActEmotion] Failed to parse ACT payload JSON: "${payloadText}"`, e)
    }

    return { emotion: null as EmotionPayload | null, ok: false }
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        const actParsed = parseActEmotion(ctx.data)
        if (actParsed.ok && actParsed.emotion) {
          ctx.emit('emotion', actParsed.emotion)
          emotionsQueue.enqueue(actParsed.emotion)
        }
      },
    ],
  })
}
