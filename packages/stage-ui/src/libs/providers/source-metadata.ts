export type ProviderSourcePricing = 'free' | 'paid'
export type ProviderSourceDeployment = 'local' | 'cloud'

/**
 * Represents source catalogue tags used by provider filtering UI.
 */
export interface ProviderSourceMetadata {
  /** Price bucket shown by the provider source filter. */
  pricing?: ProviderSourcePricing
  /** Runtime/deployment bucket shown by the provider source filter. */
  deployment?: ProviderSourceDeployment
  /** Whether the provider should receive the existing recommended tag. */
  beginnerRecommended?: boolean
}

export interface ProviderSourceMetadataInput {
  id?: string
}

const paidCloud = {
  pricing: 'paid',
  deployment: 'cloud',
} satisfies ProviderSourceMetadata

const freeLocal = {
  pricing: 'free',
  deployment: 'local',
} satisfies ProviderSourceMetadata

const recommendedPaidCloud = {
  ...paidCloud,
  beginnerRecommended: true,
} satisfies ProviderSourceMetadata

const providerSourceMetadataById = {
  '302-ai': paidCloud,
  'aihubmix': paidCloud,
  'alibaba-cloud-model-studio': paidCloud,
  'aliyun-nls-transcription': paidCloud,
  'amazon-bedrock': paidCloud,
  'anthropic': paidCloud,
  'app-local-audio-speech': freeLocal,
  'app-local-audio-transcription': freeLocal,
  'azure-ai-foundry': paidCloud,
  'azure-openai': paidCloud,
  'browser-local-audio-speech': freeLocal,
  'browser-local-audio-transcription': freeLocal,
  'browser-web-speech-api': freeLocal,
  'byteplus': paidCloud,
  'byteplus-coding-plan': paidCloud,
  'cerebras-ai': paidCloud,
  'cloudflare-workers-ai': paidCloud,
  'comet-api': paidCloud,
  'comet-api-speech': paidCloud,
  'comet-api-transcription': paidCloud,
  'deepgram-tts': paidCloud,
  'deepseek': paidCloud,
  'elevenlabs': paidCloud,
  'featherless-ai': paidCloud,
  'fireworks-ai': paidCloud,
  'google-generative-ai': paidCloud,
  'groq': paidCloud,
  'index-tts-vllm': freeLocal,
  'kokoro-local': freeLocal,
  'lm-studio': freeLocal,
  'microsoft-speech': paidCloud,
  'mimo': paidCloud,
  'mimo-audio-speech': paidCloud,
  'mimo-audio-transcription': paidCloud,
  'minimax': paidCloud,
  'minimax-global': paidCloud,
  'minimax-speech': paidCloud,
  'mistral-ai': paidCloud,
  'modelscope': paidCloud,
  'moonshot-ai': paidCloud,
  'n1n': paidCloud,
  'novita-ai': paidCloud,
  'nvidia': paidCloud,
  'official-provider': recommendedPaidCloud,
  'official-provider-speech': recommendedPaidCloud,
  'official-provider-speech-streaming': recommendedPaidCloud,
  'ollama': freeLocal,
  'openai': paidCloud,
  'openai-audio-speech': paidCloud,
  'openai-audio-transcription': paidCloud,
  'openai-compatible': false,
  'openai-compatible-audio-speech': false,
  'openai-compatible-audio-transcription': false,
  'openrouter-ai': paidCloud,
  'openrouter-audio-speech': paidCloud,
  'perplexity-ai': paidCloud,
  'player2-speech': freeLocal,
  'speech-noop': false,
  'together-ai': paidCloud,
  'volcengine': paidCloud,
  'volcengine-coding-plan': paidCloud,
  'xai': paidCloud,
  'zai': paidCloud,
} satisfies Record<string, ProviderSourceMetadata | false>

/**
 * Normalizes provider source metadata by dropping undefined fields.
 *
 * Before:
 * - `{ pricing: "paid", deployment: undefined }`
 *
 * After:
 * - `{ pricing: "paid" }`
 */
function compactProviderSourceMetadata(metadata: ProviderSourceMetadata): ProviderSourceMetadata {
  return {
    ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
    ...(metadata.deployment ? { deployment: metadata.deployment } : {}),
    ...(metadata.beginnerRecommended !== undefined ? { beginnerRecommended: metadata.beginnerRecommended } : {}),
  }
}

/**
 * Resolves the provider source tags used by settings/provider filtering.
 *
 * Use when:
 * - Rendering provider source cards.
 * - Converting defineProvider() catalogue entries to legacy ProviderMetadata.
 *
 * Expects:
 * - `metadata.id` may identify a provider with catalogue metadata.
 *
 * Returns:
 * - Compact metadata with only meaningful tag fields.
 */
export function resolveProviderSourceMetadata(
  metadata: ProviderSourceMetadataInput = {},
): ProviderSourceMetadata {
  if (!metadata.id)
    return {}

  const sourceMetadata = providerSourceMetadataById[metadata.id as keyof typeof providerSourceMetadataById]
  if (sourceMetadata === false)
    return {}
  if (sourceMetadata)
    return compactProviderSourceMetadata(sourceMetadata)

  return {}
}
