/**
 * Supported emotion values emitted through ACT tokens.
 *
 * Keep this list synchronized with renderer/runtime support.
 */
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

/** Constant-time membership lookup. */
const emotionSet = new Set<string>(emotionValues)

export type StreamingControlEmotion = (typeof emotionValues)[number]

export interface StreamingControlEmotionPayload {
  /** Canonical normalized emotion. */
  name: StreamingControlEmotion
  /** Emotion strength in range [0–1]. */
  intensity: number
}

/** Selects one Live2D expression and its optional lifetime. */
export interface StreamingControlExpressionPayload {
  /** Exact expression name registered by the current Live2D model. */
  name: string
  /** Seconds before the runtime restores the model expression. */
  duration?: number
}

export interface NormalizedActPayload {
  /** Emotion request emitted by the model, when present and supported. */
  emotion?: StreamingControlEmotionPayload
  /** Live2D expression request. Null restores the model expression. */
  expression?: StreamingControlExpressionPayload | null
  /** Motion cue emitted by the model, when present. */
  motion?: string
}

/**
 * Converts arbitrary emotion text into canonical emotion.
 *
 * Examples:
 * - "Surprised" → "surprised"
 * - " HAPPY " → "happy"
 */
function normalizeEmotionName(
  value: string,
): StreamingControlEmotion | undefined {
  const normalized = value.trim().toLowerCase()

  return emotionSet.has(normalized)
    ? (normalized as StreamingControlEmotion)
    : undefined
}

/**
 * Normalizes intensity into [0, 1].
 *
 * Invalid values fallback to 1.
 *
 * // content of things need notice:
 * // Accept numeric strings because many streaming payloads arrive serialized.
 */
function normalizeIntensity(value: unknown): number {
  const numeric
    = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(numeric)) {
    return 1
  }

  return Math.max(0, Math.min(1, numeric))
}

/**
 * Converts arbitrary emotion payload into normalized structure.
 *
 * Supported:
 * - "happy"
 * - { name: "happy" }
 * - { name: "happy", intensity: 0.8 }
 */
function normalizeEmotion(
  value: unknown,
): StreamingControlEmotionPayload | undefined {
  if (typeof value === 'string') {
    const name = normalizeEmotionName(value)

    return name
      ? {
          name,
          intensity: 1,
        }
      : undefined
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const normalizedValue = value as {
    name?: unknown
    intensity?: unknown
  }

  const name
    = typeof normalizedValue.name === 'string'
      ? normalizeEmotionName(normalizedValue.name)
      : undefined

  if (!name) {
    return undefined
  }

  return {
    name,
    intensity: normalizeIntensity(normalizedValue.intensity),
  }
}

/**
 * Trims and validates motion values.
 *
 * Empty strings become undefined.
 */
function normalizeMotion(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()

  return normalized.length > 0
    ? normalized
    : undefined
}

function normalizeDuration(value: unknown): number | undefined {
  const duration = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN

  return Number.isFinite(duration) && duration > 0 ? duration : undefined
}

function normalizeExpression(value: unknown): StreamingControlExpressionPayload | null | undefined {
  if (value === null)
    return null

  if (typeof value === 'string') {
    const name = value.trim()
    return name.length > 0 ? { name } : undefined
  }

  if (typeof value !== 'object' || Array.isArray(value))
    return undefined

  const expression = value as { name?: unknown, duration?: unknown }
  if (typeof expression.name !== 'string')
    return undefined

  const name = expression.name.trim()
  if (name.length === 0)
    return undefined

  const duration = normalizeDuration(expression.duration)
  return {
    name,
    ...(duration !== undefined && { duration }),
  }
}

/**
 * Normalizes ACT token payloads.
 *
 * Input:
 * {
 *   emotion: "Surprised",
 *   motion: " nod "
 * }
 *
 * Output:
 * {
 *   emotion: {
 *     name: "surprised",
 *     intensity: 1
 *   },
 *   motion: "nod"
 * }
 */
export function normalizeActPayload(
  payload: Record<string, unknown>,
): NormalizedActPayload {
  const emotion = normalizeEmotion(payload.emotion)
  const expression = normalizeExpression(payload.expression)
  const motion = normalizeMotion(payload.motion)

  return {
    ...(emotion && { emotion }),
    ...(expression !== undefined && { expression }),
    ...(motion && { motion }),
  }
}
