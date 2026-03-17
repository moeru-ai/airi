import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { Emotion, EmotionPayload } from '../constants/emotions'

import { sleep } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { EMOTION_VALUES } from '../constants/emotions'

export function useSpecialTokenQueue(emotionsQueue: UseQueueReturn<EmotionPayload>) {
  const normalizeEmotionName = (value: string): Emotion | string => {
    const trimmed = value.trim()
    const lower = trimmed.toLowerCase()
    // If it matches a known emotion enum value, return the standard key
    if (EMOTION_VALUES.includes(lower as Emotion))
      return lower as Emotion
    // Otherwise return the original casing (needed for VRMA filenames)
    return trimmed
  }

  const normalizeIntensity = (value: unknown): number => {
    if (typeof value !== 'number' || Number.isNaN(value))
      return 1
    return Math.min(1, Math.max(0, value))
  }

  function extractEmotions(payload: any): EmotionPayload[] {
    const results: EmotionPayload[] = []

    // 1. Emotion object or string
    if (payload?.emotion && typeof payload.emotion === 'object' && !Array.isArray(payload.emotion)) {
      if (typeof payload.emotion.name === 'string') {
        const normalized = normalizeEmotionName(payload.emotion.name)
        if (normalized) {
          const intensity = normalizeIntensity(payload.emotion.intensity)
          results.push({ name: normalized, intensity })
        }
      }
    }
    else if (typeof payload?.emotion === 'string') {
      const normalized = normalizeEmotionName(payload.emotion)
      if (normalized) {
        results.push({ name: normalized, intensity: 1 })
      }
    }

    // 2. Motion string
    if (typeof payload?.motion === 'string') {
      const normalized = normalizeEmotionName(payload.motion)
      if (normalized && !results.some(r => r.name === normalized)) {
        results.push({ name: normalized, intensity: 1 })
      }
    }

    return results
  }

  function parseActEmotion(content: string) {
    const match = /<\|ACT\s*(?::\s*)?([\s\S]*?)\|>/i.exec(content)
    if (!match)
      return { ok: false, emotions: [] as EmotionPayload[] }

    const payloadText = match[1].trim()
    let emotions: EmotionPayload[] = []

    // Attempt 1: Strict JSON parse
    try {
      const payload = JSON.parse(payloadText)
      emotions = extractEmotions(payload)
    }
    catch {
      // Attempt 2: Try wrapping in braces if missing
      if (!payloadText.startsWith('{')) {
        try {
          const wrapped = JSON.parse(`{${payloadText}}`)
          emotions = extractEmotions(wrapped)
        }
        catch { /* continue to fallback */ }
      }
    }

    // Attempt 3: Regex fallback for raw key-value pairs
    if (emotions.length === 0) {
      const emotionMatch = /"?(?:emotion|motion)"?\s*:\s*(?:\{?[\s\S]*?"name"\s*:\s*)?"?([^"}\s,]+)"??/gi
      let m
      while ((m = emotionMatch.exec(payloadText)) !== null) {
        const name = m[1]
        const normalized = normalizeEmotionName(name)
        if (normalized && !emotions.some(e => e.name === normalized)) {
          const intensityMatch = /"?intensity"?\s*:\s*([\d.]+)/i.exec(payloadText)
          const intensity = intensityMatch ? normalizeIntensity(Number.parseFloat(intensityMatch[1])) : 1
          emotions.push({ name: normalized, intensity })
        }
      }
    }

    return { ok: emotions.length > 0, emotions }
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

        // 2. Check for Emotion/Motion
        const actParsed = parseActEmotion(ctx.data)
        if (actParsed.ok) {
          for (const emotion of actParsed.emotions) {
            // Trace log for debugging
            // eslint-disable-next-line no-console
            console.log('[Queue] Dispatching ACT payload:', emotion)
            ctx.emit('emotion', emotion)
            emotionsQueue.enqueue(emotion)
          }
        }
      },
    ],
  })
}
