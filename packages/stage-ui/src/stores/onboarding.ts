import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useAuthStore } from './auth'
import { useProvidersStore } from './providers'

const essentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek', 'openai-compatible', 'official-provider'] as const
const credentialBasedEssentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'deepseek'] as const

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const providersStore = useProvidersStore()
  const authStore = useAuthStore()

  // Track if first-time setup has been completed or skipped
  const hasCompletedSetup = useLocalStorage('onboarding/completed', false)
  const hasSkippedSetup = useLocalStorage('onboarding/skipped', false)

  // Track if we should show the setup dialog
  const showingSetup = ref(false)

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
  const skipOnboardingPath = ['/auth/sign-in', '/auth/callback']
  const needsOnboarding = computed(() =>
    !authStore.isAuthenticated
    && !authStore.token
    && !hasSkippedSetup.value
    && !hasCompletedSetup.value
    && !skipOnboardingPath.includes(document.location.pathname),
  )

  // Keep in-memory display flag aligned with persisted onboarding status
  // when setup is completed/skipped from another window (desktop multi-window case).
  watch(needsOnboarding, (needSetup) => {
    if (!needSetup) {
      showingSetup.value = false
    }
  })

  // Mark setup as completed
  function markSetupCompleted() {
    hasCompletedSetup.value = true
    hasSkippedSetup.value = false
    showingSetup.value = false
  }

  // Mark setup as skipped
  function markSetupSkipped() {
    hasSkippedSetup.value = true
    showingSetup.value = false
  }

  // Reset setup state (for testing or re-showing setup)
  function resetSetupState() {
    hasCompletedSetup.value = false
    hasSkippedSetup.value = false
    showingSetup.value = false
  }

  // Force show setup dialog
  function forceShowSetup() {
    showingSetup.value = true
  }

  return {
    hasCompletedSetup,
    hasSkippedSetup,
    showingSetup,
    hasEssentialProviderConfigured,
    hasEssentialProviderCredentialConfigured,
    needsOnboarding,

    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
    forceShowSetup,
  }
})
