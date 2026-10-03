import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { useProviderConfigStore } from './config'
import { useProviderStore } from './provider'

const syncedContexts: Array<{
  app: App
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  let providerStore: ReturnType<typeof useProviderStore> | undefined
  let providerConfigStore: ReturnType<typeof useProviderConfigStore> | undefined
  const app = createApp({
    setup() {
      providerStore = useProviderStore()
      providerConfigStore = useProviderConfigStore()
      return () => null
    },
  })
  app
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .mount(document.createElement('div'))
  if (!providerStore || !providerConfigStore)
    throw new Error('Provider stores did not initialize')

  syncedContexts.push({ app, pinia, runtime })
  return { pinia, providerConfigStore, providerStore, runtime }
}

describe('onboarding provider save synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      return Response.json({ object: 'list', data: [{ id: 'grok-4.6' }, { id: 'grok-4.5' }] })
    }))
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.app.unmount()
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // ROOT CAUSE:
  //
  // Onboarding's save wrote credentials through the `configs` computed
  // projection; the write never reached the owning synchronized state, so the
  // follower's model list loaded empty. This test drives the fixed save
  // sequence from a follower context against a leader context.
  it('persists the onboarding save through the leader and loads the model list in the follower', async () => {
    const namespace = `onboarding-save:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await expect.poll(() => leader.runtime.isLeader()).toBe(true)

    const follower = createSyncedContext(namespace, 'follower-only')
    await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)

    const providerId = 'openai-compatible'
    const config = { apiKey: 'sk-test', baseUrl: 'https://aigw.example.com/v1' }

    // The fixed onboarding.vue saveProviderConfiguration sequence.
    await follower.providerStore.initializeProvider(providerId)
    await follower.providerConfigStore.patchProviderConfig(providerId, config)
    await follower.providerStore.forceProviderConfigured(providerId)

    // The leader owns persistence and must hold the saved credentials.
    await expect.poll(() => leader.providerConfigStore.getProviderConfig(providerId)).toMatchObject(config)
    expect(leader.providerConfigStore.providers[providerId]?.status).toBe('configured')
    expect(leader.providerConfigStore.addedProviders[providerId]).toBe(true)

    // The follower's replica must see the same state instead of losing the
    // write on the next projection recomputation.
    await expect.poll(() => follower.providerConfigStore.getProviderConfig(providerId)).toMatchObject(config)
    expect(follower.providerConfigStore.providers[providerId]?.status).toBe('configured')

    // Persistence owner wrote the configuration to localStorage.
    await expect.poll(() => JSON.parse(localStorage.getItem('settings/providers/configured') ?? '{}')).toMatchObject({
      [providerId]: { config },
    })

    // The model list must load through the leader and become visible in the
    // follower's replicated runtime state.
    await follower.providerStore.fetchModelsForProvider(providerId)
    await expect.poll(() => follower.providerStore.getModelsForProvider(providerId).map(model => model.id))
      .toEqual(['grok-4.6', 'grok-4.5'])
  })
})
