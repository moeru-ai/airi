import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { Emotion, EmotionPayload } from '../constants/emotions'

import { createQueue } from '@proj-airi/stream-kit'

import { EMOTION_VALUES } from '../constants/emotions'

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
    const match = /<\|ACT (\{[\s\S]*\})\|>/i.exec(content)
    if (!match)
      return { ok: false, emotion: null as EmotionPayload | null }

    const payloadText = match[1]
    try {
      const payload = JSON.parse(payloadText) as { emotion?: unknown }
      const emotion = payload?.emotion
      if (typeof emotion === 'string') {
        const normalized = normalizeEmotionName(emotion)
        if (normalized)
          return { ok: true, emotion: { name: normalized, intensity: 1 } }
      }
      else if (emotion && typeof emotion === 'object' && !Array.isArray(emotion)) {
        if ('name' in emotion && typeof (emotion as { name?: unknown }).name === 'string') {
          const normalized = normalizeEmotionName((emotion as { name: string }).name)
          if (normalized) {
            const intensity = normalizeIntensity((emotion as { intensity?: unknown }).intensity)
            return { ok: true, emotion: { name: normalized, intensity } }
          }
        }
      }
    }
    catch (e) {
      console.warn(`[parseActEmotion] Failed to parse ACT payload JSON: "${payloadText}"`, e)
    }

    return { ok: false, emotion: null as EmotionPayload | null }
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
