import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useProvidersStore } from './providers'

export const useFirstTimeSetupStore = defineStore('firstTimeSetup', () => {
  const providersStore = useProvidersStore()

  // Track if first-time setup has been completed or skipped
  const hasCompletedSetup = useLocalStorage('firstTimeSetup/completed', false)
  const hasSkippedSetup = useLocalStorage('firstTimeSetup/skipped', false)

  // Track if we should show the setup dialog
  const shouldShowSetup = ref(false)

  // Check if any essential provider is configured
  const hasEssentialProviderConfigured = computed(() => {
    const essentialProviders = ['openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek']
    return essentialProviders.some(providerId => providersStore.configuredProviders[providerId])
  })

  // Check if first-time setup should be shown
  const needsFirstTimeSetup = computed(() => {
    // Don't show if already completed or skipped
    if (hasCompletedSetup.value || hasSkippedSetup.value) {
      return false
    }

    // Don't show if user already has essential providers configured
    if (hasEssentialProviderConfigured.value) {
      return false
    }

    return true
  })

  // Initialize setup check
  function initializeSetupCheck() {
    if (needsFirstTimeSetup.value) {
      // Delay showing the dialog to ensure the app is fully loaded
      setTimeout(() => {
        shouldShowSetup.value = true
      }, 1000)
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
    needsFirstTimeSetup,
    initializeSetupCheck,
    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
    forceShowSetup,
  }
})
