import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useProvidersStore } from '../stores/providers'

export interface UseProviderConfigOptions {
  /**
   * Whether to require API key for the provider to be considered configured
   * @default true
   */
  requireApiKey?: boolean
  /**
   * Whether to require base URL for the provider to be considered configured
   * @default false
   */
  requireBaseUrl?: boolean
}

/**
 * Composable for checking provider configuration status
 * Provides a computed property to check if the provider has the required credentials configured
 *
 * @param providerId - The ID of the provider
 * @param options - Configuration options for what credentials are required
 * @returns An object with `apiKeyConfigured` computed property
 *
 * @example
 * // Basic usage - only checks for API key
 * const { apiKeyConfigured } = useProviderConfig('elevenlabs')
 *
 * @example
 * // Check for both API key and base URL
 * const { apiKeyConfigured } = useProviderConfig('openai-compatible-audio-speech', {
 *   requireApiKey: true,
 *   requireBaseUrl: true
 * })
 *
 * @example
 * // Only check for base URL (no API key required)
 * const { apiKeyConfigured } = useProviderConfig('player2-speech', {
 *   requireApiKey: false,
 *   requireBaseUrl: true
 * })
 */
export function useProviderConfig(providerId: string, options: UseProviderConfigOptions = {}) {
  const providersStore = useProvidersStore()
  const { providers } = storeToRefs(providersStore)

  const {
    requireApiKey = true,
    requireBaseUrl = false,
  } = options

  /**
   * Computed property that checks if the provider has the required credentials configured
   * Returns true only if all required credentials are present and non-empty (after trimming)
   */
  const apiKeyConfigured = computed(() => {
    const config = providers.value[providerId]
    if (!config)
      return false

    let hasApiKey = true
    let hasBaseUrl = true

    if (requireApiKey) {
      const apiKey = config?.apiKey as string | undefined
      hasApiKey = !!(apiKey && apiKey.trim())
    }

    if (requireBaseUrl) {
      const baseUrl = config?.baseUrl as string | undefined
      hasBaseUrl = !!(baseUrl && baseUrl.trim())
    }

    return hasApiKey && hasBaseUrl
  })

  return {
    apiKeyConfigured,
  }
}
