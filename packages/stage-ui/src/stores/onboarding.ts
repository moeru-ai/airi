import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

import { useProvidersStore } from './providers'

const essentialProviderIds = ['openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek', 'openai-compatible'] as const
const credentialBasedEssentialProviderIds = ['openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'deepseek'] as const

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const providersStore = useProvidersStore()

  // Track if first-time setup has been completed or skipped
  const hasCompletedSetup = useLocalStorage('onboarding/completed', false)
  const hasSkippedSetup = useLocalStorage('onboarding/skipped', false)

  // Track if we should show the setup dialog
  const shouldShowSetup = ref(false)

  // Check if any essential provider is configured
  const hasEssentialProviderConfigured = computed(() => {
    return essentialProviderIds.some(providerId => providersStore.configuredProviders[providerId])
  })

  // Fallback for app startup timing:
  // If configured state has not been revalidated yet, infer "configured"
  // from persisted essential credentials.
  const hasEssentialProviderCredentialConfigured = computed(() => {
    return credentialBasedEssentialProviderIds.some((providerId) => {
      const providerConfig = providersStore.providers[providerId] as Record<string, unknown> | undefined
      if (!providerConfig) {
        return false
      }

      return hasNonEmptyText(providerConfig.apiKey)
    })
  })

  // Check if first-time setup should be shown
  const needsOnboarding = computed(() => {
    if (hasSkippedSetup.value) {
      console.warn('Onboarding already skipped')
      return false
    }

    const hasConfiguredEssentialProvider = hasEssentialProviderCredentialConfigured.value || hasEssentialProviderConfigured.value

    // Recover from stale completed flag (e.g. setup window closed unexpectedly):
    // only treat completion as final when an essential provider is actually configured.
    if (hasCompletedSetup.value && hasConfiguredEssentialProvider) {
      console.warn('Onboarding already completed with configured provider')
      return false
    }

    // Don't show if user already has persisted essential credentials/runtime config.
    if (hasConfiguredEssentialProvider) {
      console.warn('Essential provider credentials already configured, no onboarding needed')
      return false
    }

    return true
  })

  // Keep in-memory display flag aligned with persisted onboarding status
  // when setup is completed/skipped from another window (desktop multi-window case).
  watch(needsOnboarding, (needSetup) => {
    if (!needSetup) {
      shouldShowSetup.value = false
    }
  })

  // Initialize setup check
  async function initializeSetupCheck() {
    if (needsOnboarding.value) {
      // Use nextTick to ensure the app is fully rendered before showing dialog
      await nextTick()
      shouldShowSetup.value = true
    }
  }

  // Mark setup as completed
  function markSetupCompleted() {
    hasCompletedSetup.value = true
    hasSkippedSetup.value = false
    shouldShowSetup.value = false
  }

  // Mark setup as skipped
  function markSetupSkipped() {
    hasSkippedSetup.value = true
    shouldShowSetup.value = false
  }

  // Reset setup state (for testing or re-showing setup)
  function resetSetupState() {
    hasCompletedSetup.value = false
    hasSkippedSetup.value = false
    shouldShowSetup.value = false
  }

  // Force show setup dialog
  function forceShowSetup() {
    shouldShowSetup.value = true
  }

  return {
    hasCompletedSetup,
    hasSkippedSetup,
    shouldShowSetup,
    hasEssentialProviderConfigured,
    hasEssentialProviderCredentialConfigured,
    needsOnboarding,

    initializeSetupCheck,
    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
    forceShowSetup,
  }
})
