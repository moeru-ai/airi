// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

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
    const result = store.request({ source: 'startup' })
    await vi.waitFor(() => expect(store.activeRequest).not.toBeNull())

    expect(store.needsOnboarding).toBe(true)

    providerStore.configuredProviders.openai = true
    await nextTick()

    expect(store.hasEssentialProviderConfigured).toBe(true)
    expect(store.needsOnboarding).toBe(true)
    expect(store.activeRequest).not.toBeNull()

    await store.dismissActiveRequest()
    await result
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
    for (const step of sharedOnboardingSteps)
      expect(records[step.id]).toMatchObject({ version: step.version, outcome: 'done' })
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

    expect(store.pendingSteps.map(step => step.id)).toContain(firstStep.id)
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

    expect(store.pendingSteps.map(step => step.id)).toEqual(sharedOnboardingSteps.filter(step => step.scope === 'provider-setup').map(step => step.id))
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

describe('onboarding requests', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** Records every shared step as done, as a device that finished the first onboarding. */
  function seedFinishedSharedSteps() {
    localStorage.setItem('onboarding/steps', JSON.stringify(Object.fromEntries(
      sharedOnboardingSteps.map(step => [step.id, { version: step.version, outcome: 'done', at: 0 }]),
    )))
  }

  it('resolves with the outcome of each step after the flow records them', async () => {
    const store = useOnboardingStore()
    const result = store.request({ source: 'startup' })
    await vi.waitFor(() => expect(store.activeRequest).not.toBeNull())

    expect(store.activeRequest?.stepIds).toEqual(sharedOnboardingSteps.map(step => step.id))
    await store.recordSteps(sharedOnboardingSteps.slice(0, 3), 'done')
    await store.recordSteps(sharedOnboardingSteps.slice(3), 'later')
    await store.settleRequest(store.activeRequest!.id)

    expect(await result).toEqual({
      'welcome': 'done',
      'provider-selection': 'done',
      'provider-configuration': 'done',
      'model-selection': 'later',
    })
  })

  it('resolves with pending steps when the user closes the flow', async () => {
    const store = useOnboardingStore()
    const result = store.request({ source: 'startup' })
    await vi.waitFor(() => expect(store.activeRequest).not.toBeNull())

    await store.dismissActiveRequest()

    expect(Object.values(await result)).toEqual(sharedOnboardingSteps.map(() => 'pending'))
    expect(store.activeRequest).toBeNull()
  })

  it('opens no flow when no requested step is pending, and opens it with force', async () => {
    seedFinishedSharedSteps()
    const store = useOnboardingStore()

    expect(await store.request({ steps: ['model-selection'], source: 'settings' })).toEqual({})
    expect(store.activeRequest).toBeNull()

    const forced = store.request({ steps: ['model-selection'], source: 'settings', force: true })
    await vi.waitFor(() => expect(store.activeRequest).not.toBeNull())
    // Model selection needs the provider steps, so the request adds them.
    expect(store.activeRequest?.stepIds).toEqual(sharedOnboardingSteps.map(step => step.id))
    await store.dismissActiveRequest()
    await forced
  })

  it('adds the required steps of a host step', async () => {
    seedFinishedSharedSteps()
    const store = useOnboardingStore()
    store.registerHostSteps([
      { id: 'permissions', scope: 'device' },
      { id: 'microphone-check', scope: 'device', requires: ['permissions'] },
    ])

    const result = store.request({ steps: ['microphone-check'], source: 'wake-word-toggle' })
    await vi.waitFor(() => expect(store.activeRequest).not.toBeNull())

    expect(store.activeRequest?.stepIds).toEqual(['permissions', 'microphone-check'])
    await store.dismissActiveRequest()
    await result
  })

  it('opens a queued request after the open flow closes', async () => {
    seedFinishedSharedSteps()
    const store = useOnboardingStore()
    store.registerHostSteps([{ id: 'permissions', scope: 'device' }, { id: 'microphone-check', scope: 'device' }])

    const first = store.request({ steps: ['permissions'], source: 'first' })
    const second = store.request({ steps: ['microphone-check'], source: 'second' })
    await vi.waitFor(() => expect(store.activeRequest?.source).toBe('first'))

    await store.dismissActiveRequest()
    await first

    expect(store.activeRequest?.source).toBe('second')
    await store.dismissActiveRequest()
    await second
  })

  it('opens onboarding at startup for a device step after sign-in or provider setup', () => {
    const providerStore = useProviderConfigStore()
    providerStore.configuredProviders.openai = true
    const store = useOnboardingStore()

    expect(store.needsOnboarding).toBe(false)
    store.registerHostSteps([{ id: 'permissions', scope: 'device' }])

    expect(store.pendingSteps.map(step => step.id)).toEqual(['permissions'])
    expect(store.needsOnboarding).toBe(true)
  })

  it('ends the open flow after authentication', async () => {
    const store = useOnboardingStore()
    const result = store.request({ source: 'startup' })
    await vi.waitFor(() => expect(store.activeRequest).not.toBeNull())

    await store.closeAfterAuthentication()

    expect(Object.values(await result)).toEqual(sharedOnboardingSteps.map(() => 'done'))
    expect(store.activeRequest).toBeNull()
  })
})

describe('onboarding requests after sign-in', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  // Found in the review of https://github.com/moeru-ai/airi/pull/3296
  // ROOT CAUSE:
  //
  // Sign-in removed the first queued request. When the welcome step had already ended the
  // provider request, that was a request for a device step, and its flow never opened.
  //
  // We fixed this by removing only the provider steps from the queued requests.
  it('keeps a queued request for a device step after sign-in', async () => {
    const store = useOnboardingStore()
    store.registerHostSteps([{ id: 'permissions', scope: 'device' }])
    const startup = store.request({ steps: ['welcome'], source: 'startup' })
    const permissions = store.request({ steps: ['permissions'], source: 'wake-word-toggle' })
    await vi.waitFor(() => expect(store.activeRequest?.source).toBe('startup'))

    await store.dropProviderSetupSteps()
    await startup
    await store.closeAfterAuthentication()

    expect(store.activeRequest).toMatchObject({ source: 'wake-word-toggle', stepIds: ['permissions'] })
    await store.dismissActiveRequest()
    expect(await permissions).toEqual({ permissions: 'pending' })
  })

  it('keeps the device steps of a mixed request under a new ID after sign-in', async () => {
    const store = useOnboardingStore()
    store.registerHostSteps([{ id: 'permissions', scope: 'device' }])
    const result = store.request({ source: 'startup' })
    await vi.waitFor(() => expect(store.activeRequest).not.toBeNull())
    const firstId = store.activeRequest!.id

    await store.closeAfterAuthentication()

    expect(store.activeRequest?.stepIds).toEqual(['permissions'])
    // A new ID tells the dialog and the desktop presenter to open the flow again.
    expect(store.activeRequest?.id).not.toBe(firstId)
    await store.dismissActiveRequest()
    // The caller's request ID left the queue, so it resolves after sign-in.
    expect((await result)['model-selection']).toBe('done')
  })
})

describe('isStepPending', () => {
  it('is pending without a record and with a record of an older version', () => {
    expect(isStepPending({}, { id: 'notice', version: 1 })).toBe(true)
    expect(isStepPending({ notice: { version: 1, outcome: 'later', at: 0 } }, { id: 'notice', version: 2 })).toBe(true)
    expect(isStepPending({ notice: { version: 2, outcome: 'later', at: 0 } }, { id: 'notice', version: 2 })).toBe(false)
  })
})
