/** Context request bytes split without claiming an exact provider token count. */
export interface ContextBudget {
  /** UTF-8 bytes excluding inline data:image/... payloads only. */
  textBytes: number
  /** UTF-8 bytes of inline image data URLs in declared image content. */
  imageBytes: number
  /** UTF-8 bytes of the serialized input passed to the measurement function. */
  totalBytes: number
}

/** Model metadata and the output cap of one resolved provider request. */
export interface ContextBudgetLimitInput {
  /** Provider-reported or catalog context window, in tokens. */
  contextWindowTokens?: number
  /** Output cap actually sent for this request, when known. */
  requestedOutputTokens?: number
  /** Model-reported maximum output, used only when the request has no explicit cap. */
  modelMaxOutputTokens?: number
}

/** Application byte limits. Model metadata can refine the soft threshold. */
export interface ContextBudgetFallback {
  softLimitBytes: number
  hardLimitBytes: number
}

/** Application hard ceiling and estimated soft threshold. */
export interface ContextBudgetLimits extends ContextBudgetFallback {
  /** The model metadata source for the token window, when known. */
  contextWindowTokens?: number
  /** Output space reserved by policy; this is not measured usage. */
  outputReserveTokens?: number
  /** Extra space reserved for provider framing and estimation uncertainty. */
  safetyMarginTokens?: number
  source: 'provider-model-metadata' | 'bounded-byte-fallback'
}

export const DEFAULT_CONTEXT_SOFT_LIMIT_BYTES = 256 * 1024
export const DEFAULT_CONTEXT_HARD_LIMIT_BYTES = 512 * 1024
const DEFAULT_OUTPUT_RESERVE_TOKENS = 4096

const SAFETY_MARGIN_FRACTION = 0.05
const MINIMUM_SAFETY_MARGIN_TOKENS = 256
const IMAGE_CONTENT_TYPES = new Set(['image', 'image_url', 'input_image'])
const IMAGE_PAYLOAD_KEYS = new Set(['data', 'image_data', 'image_url', 'url'])

function isInlineImageDataUrl(value: string) {
  return value.slice(0, 11).toLowerCase() === 'data:image/' && value.includes(';base64,')
}

function utf8Bytes(value: unknown) {
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength
}

function imagePayloadBytes(value: unknown, key?: string, imageObject = false): number {
  if (typeof value === 'string') {
    const isInlineImage = imageObject && key !== undefined && IMAGE_PAYLOAD_KEYS.has(key) && isInlineImageDataUrl(value)
    return isInlineImage ? utf8Bytes(value) : 0
  }

  if (Array.isArray(value))
    return value.reduce((total, item) => total + imagePayloadBytes(item, undefined, imageObject), 0)

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const isImage = imageObject || (typeof record.type === 'string' && IMAGE_CONTENT_TYPES.has(record.type))
    return Object.entries(record).reduce((total, [childKey, child]) => total + imagePayloadBytes(child, childKey, isImage), 0)
  }

  return 0
}

/** Measures a serialized provider request without pretending that bytes are tokens. */
export function measureContextBudget(value: unknown): ContextBudget {
  const totalBytes = utf8Bytes(value)
  const imageBytes = Math.min(totalBytes, imagePayloadBytes(value))
  return { textBytes: totalBytes - imageBytes, imageBytes, totalBytes }
}

/**
 * Uses model metadata to schedule Compact earlier. The estimated byte ratio cannot reject a
 * request below the application ceiling. An explicit output cap that fills the model window
 * leaves zero input capacity. The provider enforces its actual context limit.
 */
export function resolveContextBudgetLimits(
  input: ContextBudgetLimitInput,
  fallback: ContextBudgetFallback = {
    softLimitBytes: DEFAULT_CONTEXT_SOFT_LIMIT_BYTES,
    hardLimitBytes: DEFAULT_CONTEXT_HARD_LIMIT_BYTES,
  },
): ContextBudgetLimits {
  const contextWindowTokens = Number.isSafeInteger(input.contextWindowTokens) && (input.contextWindowTokens ?? 0) > 0
    ? input.contextWindowTokens
    : undefined

  if (!contextWindowTokens)
    return { ...fallback, source: 'bounded-byte-fallback' }

  const safetyMarginTokens = Math.min(
    Math.max(MINIMUM_SAFETY_MARGIN_TOKENS, Math.ceil(contextWindowTokens * SAFETY_MARGIN_FRACTION)),
    Math.floor(contextWindowTokens / 4),
  )
  const requestedOutputTokens = Number.isSafeInteger(input.requestedOutputTokens) && (input.requestedOutputTokens ?? 0) > 0
    ? input.requestedOutputTokens
    : undefined
  const modelMaxOutputTokens = Number.isSafeInteger(input.modelMaxOutputTokens) && (input.modelMaxOutputTokens ?? 0) > 0
    ? input.modelMaxOutputTokens
    : undefined
  const outputReserveTokens = requestedOutputTokens
    ?? Math.min(modelMaxOutputTokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS, DEFAULT_OUTPUT_RESERVE_TOKENS, Math.floor(contextWindowTokens / 4))
  const hardLimitBytes = requestedOutputTokens !== undefined && requestedOutputTokens >= contextWindowTokens ? 0 : fallback.hardLimitBytes
  const estimatedInputTokens = contextWindowTokens - outputReserveTokens - safetyMarginTokens

  return {
    softLimitBytes: hardLimitBytes === 0 ? 0 : Math.min(fallback.softLimitBytes, Math.max(1, Math.floor(estimatedInputTokens * 0.75))),
    hardLimitBytes,
    contextWindowTokens,
    outputReserveTokens,
    safetyMarginTokens,
    source: 'provider-model-metadata',
  }
}
