import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { Emotion, EmotionPayload } from '../constants/emotions'

import { sleep } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { EMOTION_VALUES } from '../constants/emotions'

export function useSpecialTokenQueue(emotionsQueue: UseQueueReturn<EmotionPayload>) {
  const normalizeEmotionName = (value: string): Emotion | string => {
    const normalized = value.trim().toLowerCase()
    if (EMOTION_VALUES.includes(normalized as Emotion))
      return normalized as Emotion
    return value.trim()
  }

  const normalizeIntensity = (value: unknown): number => {
    if (typeof value !== 'number' || Number.isNaN(value))
      return 1
    return Math.min(1, Math.max(0, value))
  }

  function extractFromPayload(payload: any) {
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
    return { ok: false, emotion: null as EmotionPayload | null }
  }

  function parseActEmotion(content: string) {
    const match = /<\|ACT\s*(?::\s*)?([\s\S]*?)\|>/i.exec(content)
    if (!match)
      return { ok: false, emotion: null as EmotionPayload | null }

    const payloadText = match[1].trim()

    // Attempt 1: Strict JSON parse
    try {
      const payload = JSON.parse(payloadText) as { emotion?: unknown }
      return extractFromPayload(payload)
    }
    catch {
      // Attempt 2: Try wrapping in braces if missing
      if (!payloadText.startsWith('{')) {
        try {
          const wrapped = JSON.parse(`{${payloadText}}`)
          return extractFromPayload(wrapped)
        }
        catch { /* continue to fallback */ }
      }
    }

    // Attempt 3: Regex fallback for raw key-value pairs
    const emotionMatch = /"?emotion"?\s*:\s*(?:\{?[\s\S]*?"name"\s*:\s*)?"?([^"}\s,]+)"??/i.exec(payloadText)
    if (emotionMatch) {
      const name = emotionMatch[1]
      const normalized = normalizeEmotionName(name)
      if (normalized) {
        const intensityMatch = /"?intensity"?\s*:\s*([\d.]+)/i.exec(payloadText)
        const intensity = intensityMatch ? normalizeIntensity(Number.parseFloat(intensityMatch[1])) : 1
        return { ok: true, emotion: { name: normalized, intensity } }
      }
    }

    return { ok: false, emotion: null as EmotionPayload | null }
  }

  function parseDelay(content: string) {
    const match = /<\|DELAY:\s*(\d+)\s*\|>/i.exec(content)
    if (!match)
      return null
    const delay = Number.parseFloat(match[1])
    return Number.isNaN(delay) ? 0 : delay
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        // 1. Check for Delay
        const delay = parseDelay(ctx.data)
        if (delay !== null) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
          return
        }

        // 2. Check for Emotion
        const actParsed = parseActEmotion(ctx.data)
        if (actParsed.ok && actParsed.emotion) {
          ctx.emit('emotion', actParsed.emotion)
          emotionsQueue.enqueue(actParsed.emotion)
        }
      },
    ],
  })
}
