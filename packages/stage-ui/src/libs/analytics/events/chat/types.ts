/** Source of token accounting data for one chat generation. */
export type AiUsageSource = 'estimated' | 'reported' | 'unavailable'

/** Failure stages emitted by a chat activation or message round. */
export type ChatActivationFailureStage = 'llm_response' | 'message_send' | 'model_list' | 'provider_config' | 'tts'

/** Provider classes allowed in low-cardinality chat analytics properties. */
export type ProviderMode = 'custom' | 'official' | 'unknown'

/** Converts a provider identifier to the product analytics provider class. */
export function getProviderMode(providerId: string | undefined): ProviderMode {
  if (!providerId)
    return 'unknown'

  return providerId.startsWith('official-provider') ? 'official' : 'custom'
}
