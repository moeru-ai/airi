import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useAuthStore } from './auth'
import { useProviderConfigStore } from './providers/config'

const essentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek', 'openai-compatible', 'official-provider'] as const
const credentialBasedEssentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'deepseek'] as const

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function createLocalStorageForOnboarding() {
  const keys = {
    completed: 'onboarding/completed',
    skipped: 'onboarding/skipped',
  } as const

  return {
    getCompleted: () => localStorage.getItem(keys.completed) === 'true',
    getSkipped: () => localStorage.getItem(keys.skipped) === 'true',
    setCompleted: (value: boolean) => localStorage.setItem(keys.completed, String(value)),
    setSkipped: (value: boolean) => localStorage.setItem(keys.skipped, String(value)),
  }
}

const useOnboardingStateStore = defineStore('onboarding-state', () => {
  const storage = createLocalStorageForOnboarding()

  // Pinia owns live cross-window state. Persistence is command-driven so
  // storage events cannot become a second state propagation channel.
  const hasCompletedSetup = ref(storage.getCompleted())
  const hasSkippedSetup = ref(storage.getSkipped())
  // This counter is a transient cross-window command. The Electron onboarding
  // renderer owns the actual BrowserWindow close side effect.
  const closeRequestId = ref(0)

  function markSetupCompleted() {
    hasCompletedSetup.value = true
    hasSkippedSetup.value = false
    storage.setCompleted(true)
    storage.setSkipped(false)
  }

  function closeAfterAuthentication() {
    markSetupCompleted()
    closeRequestId.value += 1
  }

  function markSetupSkipped() {
    hasSkippedSetup.value = true
    storage.setSkipped(true)
  }

  function resetSetupState() {
    hasCompletedSetup.value = false
    hasSkippedSetup.value = false
    storage.setCompleted(false)
    storage.setSkipped(false)
  }

  return {
    closeAfterAuthentication,
    closeRequestId,
    hasCompletedSetup,
    hasSkippedSetup,
    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
  }
}, {
  synced: {
    actions: [
      'closeAfterAuthentication',
      'markSetupCompleted',
      'markSetupSkipped',
      'resetSetupState',
    ],
    state: true,
  },
})

export const useOnboardingStore = defineStore('onboarding', () => {
  const providerStore = useProviderConfigStore()
  const authStore = useAuthStore()
  const onboardingStateStore = useOnboardingStateStore()
  const closeRequestId = computed(() => onboardingStateStore.closeRequestId)
  const hasCompletedSetup = computed(() => onboardingStateStore.hasCompletedSetup)
  const hasSkippedSetup = computed(() => onboardingStateStore.hasSkippedSetup)

  // This is renderer-local view state and never crosses the Pinia channel.
  const showingSetup = ref(false)

  // Check if any essential provider is configured
  const hasEssentialProviderConfigured = computed(() => {
    return essentialProviderIds.some(providerId => providerStore.configuredProviders[providerId])
  })

  // Fallback for app startup timing:
  // If configured state has not been revalidated yet, infer "configured"
  // from persisted essential credentials.
  const hasEssentialProviderCredentialConfigured = computed(() => {
    return credentialBasedEssentialProviderIds.some((providerId) => {
      const providerConfig = providerStore.getProviderConfig(providerId)
      if (!providerConfig) {
        return false
      }

      return hasNonEmptyText(providerConfig.apiKey)
    })
  })

  // Check if first-time setup should be shown
  const skipOnboardingPath = ['/auth/callback']
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

  function markSetupCompleted() {
    showingSetup.value = false
    return onboardingStateStore.markSetupCompleted()
  }

  function closeAfterAuthentication() {
    showingSetup.value = false
    return onboardingStateStore.closeAfterAuthentication()
  }

  function markSetupSkipped() {
    showingSetup.value = false
    return onboardingStateStore.markSetupSkipped()
  }

  function resetSetupState() {
    showingSetup.value = false
    return onboardingStateStore.resetSetupState()
  }

  // Force show setup dialog
  function forceShowSetup() {
    showingSetup.value = true
  }

  return {
    hasCompletedSetup,
    hasSkippedSetup,
    showingSetup,
    closeRequestId,
    hasEssentialProviderConfigured,
    hasEssentialProviderCredentialConfigured,
    needsOnboarding,

    closeAfterAuthentication,
    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
    forceShowSetup,
  }
})
