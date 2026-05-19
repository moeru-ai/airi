const emotionValues = [
  'happy',
  'sad',
  'angry',
  'think',
  'surprised',
  'awkward',
  'question',
  'curious',
  'neutral',
] as const

export type StreamingControlEmotion = typeof emotionValues[number]

export interface StreamingControlEmotionPayload {
  name: StreamingControlEmotion
  intensity: number
}

export interface NormalizedActPayload {
  /** Emotion request emitted by the model, when present and supported. */
  emotion?: StreamingControlEmotionPayload
  /** Motion cue emitted by the model, when present. */
  motion?: string
}

function normalizeEmotionName(value: string): StreamingControlEmotion | undefined {
  const normalized = value.trim().toLowerCase()
  if (emotionValues.includes(normalized as StreamingControlEmotion)) {
    return normalized as StreamingControlEmotion
  }

  return undefined
}

function normalizeIntensity(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1
  }

  return Math.min(1, Math.max(0, value))
}

function normalizeEmotion(value: unknown): StreamingControlEmotionPayload | undefined {
  if (typeof value === 'string') {
    const name = normalizeEmotionName(value)
    return name ? { name, intensity: 1 } : undefined
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  if (!('name' in value) || typeof value.name !== 'string') {
    return undefined
  }

  const name = normalizeEmotionName(value.name)
  if (!name) {
    return undefined
  }

  return {
    name,
    intensity: normalizeIntensity('intensity' in value ? value.intensity : undefined),
  }
}

function normalizeMotion(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Normalizes ACT token payloads.
 *
 * Before:
 * - `{ emotion: "Surprised", motion: " nod " }`
 *
 * After:
 * - `{ emotion: { name: "surprised", intensity: 1 }, motion: "nod" }`
 */
export function normalizeActPayload(payload: Record<string, unknown>): NormalizedActPayload {
  const normalized: NormalizedActPayload = {}
  const emotion = normalizeEmotion(payload.emotion)
  const motion = normalizeMotion(payload.motion)

  if (emotion) {
    normalized.emotion = emotion
  }
  if (motion) {
    normalized.motion = motion
  }

  return normalized
}
