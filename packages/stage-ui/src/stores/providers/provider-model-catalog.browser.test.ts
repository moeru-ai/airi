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

describe('provider model catalog synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.app.unmount()
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2440#discussion_r3912911639
  // ROOT CAUSE:
  //
  // The settings renderer wrote the discovered default into its follower
  // snapshot. The resulting full-state proposal could overwrite newer leader
  // state, and the write was skipped when that snapshot arrived late.
  //
  // Before: mutate providerConfig.model in the follower page.
  //
  // We fixed this by routing model updates to awaited leader-owned actions.
  it('applies defaults through the leader without replacing a user selection', async () => {
    const namespace = `provider-model-default:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    const followerContext = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    await followerContext.providerStore.initializeProvider('voicevox')
    await followerContext.providerConfigStore.setProviderModelIfUnset('voicevox', 'model-b')
    await vi.waitFor(() => expect(followerContext.providerConfigStore.getProviderConfig('voicevox')?.model).toBe('model-b'))

    await leaderContext.providerConfigStore.setProviderModel('voicevox', 'model-a')
    await followerContext.providerConfigStore.setProviderModelIfUnset('voicevox', 'model-b')

    expect(leaderContext.providerConfigStore.getProviderConfig('voicevox')?.model).toBe('model-a')
    await vi.waitFor(() => expect(followerContext.providerConfigStore.getProviderConfig('voicevox')?.model).toBe('model-a'))
  })
})
