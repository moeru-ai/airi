import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { Emotion, EmotionPayload } from '../constants/emotions'

import { sleep } from '@moeru/std'
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

  const normalizeHoldMs = (value: unknown): number => {
    if (typeof value !== 'number' || Number.isNaN(value))
      return 1800
    return Math.min(10000, Math.max(300, Math.floor(value)))
  }

  function extractActPayloadTexts(content: string): string[] {
    const source = content.replace(/\\\{ACT/gi, '{ACT')
    const payloads: string[] = []
    let index = 0

    while (index < source.length) {
      const openAct = source.indexOf('<|ACT', index)
      const angleAct = source.indexOf('<ACT', index)
      const braceAct = source.indexOf('{ACT', index)
      const candidates = [openAct, angleAct, braceAct].filter(value => value >= 0)
      const markerIndex = candidates.length > 0 ? Math.min(...candidates) : -1

      if (markerIndex === -1)
        break

      const jsonStart = source.indexOf('{', markerIndex + 1)
      if (jsonStart === -1)
        break

      let cursor = jsonStart
      let depth = 0
      let inString = false
      let escaped = false
      let endIndex = -1

      while (cursor < source.length) {
        const char = source[cursor]
        if (escaped) {
          escaped = false
        }
        else if (char === '\\') {
          escaped = true
        }
        else if (char === '"') {
          inString = !inString
        }
        else if (!inString && char === '{') {
          depth++
        }
        else if (!inString && char === '}') {
          depth--
          if (depth === 0) {
            endIndex = cursor
            break
          }
        }
        cursor++
      }

      if (endIndex === -1)
        break

      payloads.push(source.slice(jsonStart, endIndex + 1))
      index = endIndex + 1
    }

    return payloads
  }

  function parseActEmotion(payloadText: string) {
    try {
      const payload = JSON.parse(payloadText) as { emotion?: unknown, force?: unknown, holdMs?: unknown }
      const emotion = payload?.emotion
      if (typeof emotion === 'string') {
        const normalized = normalizeEmotionName(emotion)
        if (normalized)
          return {
            ok: true,
            emotion: {
              name: normalized,
              intensity: 1,
              force: payload.force === true,
              holdMs: normalizeHoldMs(payload.holdMs),
            },
          }
      }
      else if (emotion && typeof emotion === 'object' && !Array.isArray(emotion)) {
        if ('name' in emotion && typeof (emotion as { name?: unknown }).name === 'string') {
          const normalized = normalizeEmotionName((emotion as { name: string }).name)
          if (normalized) {
            const intensity = normalizeIntensity((emotion as { intensity?: unknown }).intensity)
            return {
              ok: true,
              emotion: {
                name: normalized,
                intensity,
                force: payload.force === true,
                holdMs: normalizeHoldMs(payload.holdMs),
              },
            }
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
        const payloads = extractActPayloadTexts(ctx.data)
        for (const payloadText of payloads) {
          const actParsed = parseActEmotion(payloadText)
          if (actParsed.ok && actParsed.emotion) {
            ctx.emit('emotion', actParsed.emotion)
            emotionsQueue.enqueue(actParsed.emotion)
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
