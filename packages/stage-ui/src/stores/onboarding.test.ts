// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOnboardingStore } from './onboarding'

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
        configuredProviders: {},
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
