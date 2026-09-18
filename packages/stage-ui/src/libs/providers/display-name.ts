import type { InferenceServiceProvider, ProviderDefinition } from './types'

/**
 * Resolves the user-facing name for a provider instance.
 *
 * @example
 * resolveProviderDisplayName({ definitionId: 'openai-compatible' }, { name: 'OpenAI Compatible' })
 * // => 'OpenAI Compatible'
 */
export function resolveProviderDisplayName(
  provider: Pick<InferenceServiceProvider, 'definitionId' | 'displayName'>,
  definition?: Pick<ProviderDefinition, 'name'>,
): string {
  const displayName = provider.displayName?.trim()
  if (displayName)
    return displayName

  return definition?.name || provider.definitionId
}
