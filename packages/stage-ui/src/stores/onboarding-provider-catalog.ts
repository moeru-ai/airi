const onboardingProviderIds = [
  'openai',
  'azure-openai',
  'anthropic',
  'amazon-bedrock',
  'google-generative-ai',
  'groq',
  'nvidia',
  'openrouter-ai',
  'opencode-go',
  'ollama',
  'deepseek',
  'player2',
  'openai-compatible',
] as const

/**
 * Returns the providers shown during first-time setup in product order.
 * Providers outside this curated list remain available from the settings page.
 */
export function resolveOnboardingProviders<TProvider extends { id: string }>(providers: TProvider[]): TProvider[] {
  const providerById = new Map(providers.map(provider => [provider.id, provider]))

  return onboardingProviderIds.flatMap((providerId) => {
    const provider = providerById.get(providerId)
    return provider ? [provider] : []
  })
}
