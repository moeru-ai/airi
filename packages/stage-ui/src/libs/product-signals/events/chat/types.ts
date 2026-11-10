/** Provider classes allowed in low-cardinality chat analytics properties. */
export type ProviderMode = 'official' | 'custom' | 'unknown'

/** Failure stages emitted by a chat activation or message round. */
export type ChatActivationFailureStage = 'provider_config' | 'model_list' | 'message_send' | 'llm_response' | 'tts'

/** Source of token accounting data for one chat generation. */
export type AiUsageSource = 'reported' | 'estimated' | 'unavailable'

/** Converts a provider identifier to the product analytics provider class. */
export function getProviderMode(providerId: string | undefined): ProviderMode {
  if (!providerId)
    return 'unknown'

  return providerId.startsWith('official-provider') ? 'official' : 'custom'
}
