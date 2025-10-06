import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

import { useProvidersStore } from './providers'

export const useOnboardingStore = defineStore('onboarding', () => {
  const providersStore = useProvidersStore()

  // Track if first-time setup has been completed or skipped
  const hasCompletedSetup = useLocalStorage('onboarding/completed', false)
  const hasSkippedSetup = useLocalStorage('onboarding/skipped', false)

  // Track if we should show the setup dialog
  const shouldShowSetup = ref(false)

  // Check if any essential provider is configured
  const essentialProviders = ['openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek', 'openai-compatible']

  const hasEssentialProviderConfigured = computed(() => {
    return essentialProviders.some((providerId) => {
      const configured = providersStore.configuredProviders[providerId]
      if (configured)
        return true

      return providersStore.envCredentialOverrides?.[providerId] != null
    })
  })

  // Check if first-time setup should be shown
  const needsOnboarding = computed(() => {
    // Don't show if already completed or skipped
    if (hasCompletedSetup.value || hasSkippedSetup.value)
      return false

    // Don't show if user already has essential providers configured
    if (hasEssentialProviderConfigured.value)
      return false

    return true
  })

  // Initialize setup check
  async function initializeSetupCheck() {
    await providersStore.refreshConfiguredProviders?.()

    if (!needsOnboarding.value)
      return

    // Use nextTick to ensure the app is fully rendered before showing dialog
    await nextTick()

    if (needsOnboarding.value)
      shouldShowSetup.value = true
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

  watch(hasEssentialProviderConfigured, (configured) => {
    if (configured) {
      shouldShowSetup.value = false
      if (!hasCompletedSetup.value)
        hasCompletedSetup.value = true
    }
  })

  return {
    hasCompletedSetup,
    hasSkippedSetup,
    shouldShowSetup,
    hasEssentialProviderConfigured,
    needsOnboarding,

    initializeSetupCheck,
    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
    forceShowSetup,
  }
})
