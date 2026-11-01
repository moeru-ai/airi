// @vitest-environment jsdom

import type { DevicePermission } from './device-permissions'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useDevicePermissionsStore } from './device-permissions'
import { isStepPending, sharedOnboardingSteps, useOnboardingStore } from './onboarding'
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
    vi.spyOn(providerStore, 'getProviderConfig').mockImplementation(providerId => providerId === 'azure-openai' ? { apiKey: 'sk-x', baseUrl: '' } : {})

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
  it('publishes a close request after authentication', async () => {
    const store = useOnboardingStore()

    await store.closeAfterAuthentication()

    expect(store.closeRequestId).toBe(1)
    expect(store.needsOnboarding).toBe(false)
    expect(store.$state).not.toHaveProperty('closeRequestId')
    expect(store.$state).not.toHaveProperty('stepRecords')
    const records = JSON.parse(localStorage.getItem('onboarding/steps') ?? '{}')
    for (const step of sharedOnboardingSteps.filter(step => step.scope === 'provider-setup'))
      expect(records[step.id]).toMatchObject({ version: step.version, outcome: 'done' })
    // Sign-in does not grant a permission, so the permissions step stays pending.
    expect(records.permissions).toBeUndefined()
  })

  it('records the shared steps as done when an upgrade finds the completed flag', () => {
    localStorage.setItem('onboarding/completed', 'true')
    localStorage.setItem('onboarding/skipped', 'false')

    const store = useOnboardingStore()

    expect(store.needsOnboarding).toBe(false)
    expect(store.stepRecords['analytics-notice']).toMatchObject({ version: 1, outcome: 'done' })
    expect(localStorage.getItem('onboarding/completed')).toBeNull()
    expect(localStorage.getItem('onboarding/skipped')).toBeNull()
  })

  it('opens onboarding again for a shared step whose version increased', () => {
    const [firstStep] = sharedOnboardingSteps
    localStorage.setItem('onboarding/steps', JSON.stringify({ [firstStep.id]: { version: firstStep.version - 1, outcome: 'done', at: 0 } }))

    const store = useOnboardingStore()

    expect(store.pendingSharedSteps.map(step => step.id)).toContain(firstStep.id)
    expect(store.needsOnboarding).toBe(true)
  })

  // Found in the review of https://github.com/moeru-ai/airi/pull/3293
  // ROOT CAUSE:
  //
  // A new version of only the provider configuration step showed that step alone.
  // It had no selected provider, so the user could not finish or go back.
  //
  // We fixed this by showing every provider setup step when one of them is pending.
  it('shows every provider setup step when only one of them has a new version', () => {
    const providerConfiguration = sharedOnboardingSteps.find(step => step.id === 'provider-configuration')!
    localStorage.setItem('onboarding/steps', JSON.stringify(Object.fromEntries(sharedOnboardingSteps.map(step => [
      step.id,
      { version: step === providerConfiguration ? step.version - 1 : step.version, outcome: 'done', at: 0 },
    ]))))

    const store = useOnboardingStore()

    expect(store.pendingSharedSteps.map(step => step.id)).toEqual(sharedOnboardingSteps.filter(step => step.scope === 'provider-setup').map(step => step.id))
  })

  it('treats an unreadable record value as no records', () => {
    localStorage.setItem('onboarding/steps', '{not json')

    const store = useOnboardingStore()

    expect(store.stepRecords).toEqual({})
    expect(store.needsOnboarding).toBe(true)
  })

  it('opens onboarding again after a reset', async () => {
    const store = useOnboardingStore()
    await store.recordSteps(sharedOnboardingSteps, 'done')
    expect(store.needsOnboarding).toBe(false)

    await store.resetSetupState()

    expect(store.needsOnboarding).toBe(true)
    expect(localStorage.getItem('onboarding/steps')).toBeNull()
  })
})

describe('onboarding permissions step', () => {
  /** A permission that the test host registers. Its functions do nothing, because the store only counts permissions. */
  const microphone: DevicePermission = {
    id: 'microphone',
    titleKey: 'settings.dialogs.onboarding.permissions.microphoneTitle',
    descriptionKey: 'settings.dialogs.onboarding.permissions.microphoneDescription',
    check: async () => 'not-determined',
    request: async () => {},
  }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('does not apply on a host without registered permissions', () => {
    localStorage.setItem('onboarding/completed', 'true')

    const store = useOnboardingStore()

    expect(store.needsOnboarding).toBe(false)
  })

  it('opens onboarding with only the permissions step after an upgrade', () => {
    localStorage.setItem('onboarding/completed', 'true')
    useDevicePermissionsStore().register([microphone])

    const store = useOnboardingStore()

    expect(store.pendingSharedSteps.map(step => step.id)).toEqual(['permissions'])
    expect(store.needsOnboarding).toBe(true)
  })

  it('applies when a provider was configured at startup', () => {
    useProviderConfigStore().configuredProviders.openai = true
    useDevicePermissionsStore().register([microphone])

    const store = useOnboardingStore()

    expect(store.pendingSharedSteps.map(step => step.id)).toEqual(['permissions'])
  })
})

describe('isStepPending', () => {
  it('is pending without a record and with a record of an older version', () => {
    expect(isStepPending({}, { id: 'notice', version: 1 })).toBe(true)
    expect(isStepPending({ notice: { version: 1, outcome: 'later', at: 0 } }, { id: 'notice', version: 2 })).toBe(true)
    expect(isStepPending({ notice: { version: 2, outcome: 'later', at: 0 } }, { id: 'notice', version: 2 })).toBe(false)
  })
})
