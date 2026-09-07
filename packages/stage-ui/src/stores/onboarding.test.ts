// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useOnboardingStore } from './onboarding'
import { useProviderConfigStore } from './providers/config'

vi.mock('./auth', async () => {
  const { defineStore } = await import('pinia')

  return {
    useAuthStore: defineStore('auth', {
      state: () => ({
        isAuthenticated: false,
        token: null,
      }),
    }),
  }
})

vi.mock('./providers/config', async () => {
  const { defineStore } = await import('pinia')

  return {
    useProviderConfigStore: defineStore('provider-config', {
      state: () => ({
        configuredProviders: {} as Record<string, boolean>,
      }),
      actions: {
        getProviderConfig: () => undefined,
      },
    }),
  }
})

describe('onboarding store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('suppresses onboarding for an essential provider configured at startup', () => {
    const providerStore = useProviderConfigStore()
    providerStore.configuredProviders.openai = true

    const store = useOnboardingStore()

    expect(store.needsOnboarding).toBe(false)
  })

  // ROOT CAUSE:
  //
  // Reactive provider status closed onboarding before model selection (P1).
  // The startup snapshot prevents provider changes from closing the dialog.
  // https://github.com/moeru-ai/airi/pull/1900
  it('keeps onboarding open when a provider becomes configured during setup', async () => {
    const providerStore = useProviderConfigStore()
    const store = useOnboardingStore()
    store.forceShowSetup()

    expect(store.needsOnboarding).toBe(true)

    providerStore.configuredProviders.openai = true
    await nextTick()

    expect(store.hasEssentialProviderConfigured).toBe(true)
    expect(store.needsOnboarding).toBe(true)
    expect(store.showingSetup).toBe(true)
  })

  // ROOT CAUSE:
  //
  // An azure-openai apiKey without a baseUrl suppressed onboarding even without a validated provider (P2).
  // Only validated provider status at startup can suppress onboarding.
  // https://github.com/moeru-ai/airi/pull/1900
  it('requires onboarding when startup credentials have no validated provider', () => {
    const providerStore = useProviderConfigStore()
    vi.spyOn(providerStore, 'getProviderConfig').mockImplementation(providerId => providerId === 'azure-openai' ? { apiKey: 'sk-x', baseUrl: '' } : undefined)

    const store = useOnboardingStore()

    expect(store.hasEssentialProviderCredentialConfigured).toBe(true)
    expect(store.hasEssentialProviderConfigured).toBe(false)
    expect(store.needsOnboarding).toBe(true)
  })

  // ROOT CAUSE:
  //
  // The standalone onboarding renderer previously depended on a localStorage
  // event to discover that another renderer had completed authentication. Once
  // storage stopped acting as a state bus, the BrowserWindow stayed open.
  //
  // The authenticated command now persists completion and publishes a
  // monotonic close request through synchronized Pinia state.
  it('publishes a close request after authentication', () => {
    const store = useOnboardingStore()

    store.closeAfterAuthentication()

    expect(store.hasCompletedSetup).toBe(true)
    expect(store.hasSkippedSetup).toBe(false)
    expect(store.closeRequestId).toBe(1)
    expect(store.$state).not.toHaveProperty('closeRequestId')
    expect(store.$state).not.toHaveProperty('hasCompletedSetup')
    expect(localStorage.getItem('onboarding/completed')).toBe('true')
    expect(localStorage.getItem('onboarding/skipped')).toBe('false')
  })
})
