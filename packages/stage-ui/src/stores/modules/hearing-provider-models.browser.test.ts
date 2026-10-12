import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { useHearingStore } from './hearing'

const contexts: Array<{ app: App, pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []

function createContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)

  let hearing: ReturnType<typeof useHearingStore> | undefined
  const app = createApp({
    setup() {
      hearing = useHearingStore()
      return () => null
    },
  })
  app
    .provide(injectKeyPiniaSynced, runtime)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .mount(document.createElement('div'))

  if (!hearing)
    throw new Error('Hearing store did not initialize')

  contexts.push({ app, pinia, runtime })
  return { hearing, runtime }
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.app.unmount()
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
  localStorage.clear()
})

it('restores provider models through the leader action', async () => {
  localStorage.clear()
  const namespace = `hearing:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = createContext(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))

  const oldProvider = 'old-provider'
  const nextProvider = 'next-provider'
  leader.hearing.activeTranscriptionProvider = oldProvider
  await leader.hearing.restoreProviderModel(oldProvider)
  leader.hearing.activeTranscriptionModel = 'old-model'
  leader.hearing.activeCustomModelName = 'old-model'
  leader.hearing.saveProviderModel(nextProvider, 'saved-model')
  await vi.waitFor(() => expect(follower.hearing.activeTranscriptionModel).toBe('old-model'))

  leader.hearing.activeTranscriptionProvider = nextProvider
  await vi.waitFor(() => expect(follower.hearing.activeTranscriptionProvider).toBe(nextProvider))

  let leaderActionCount = 0
  leader.hearing.$onAction(({ name }) => {
    if (name === 'restoreProviderModel')
      leaderActionCount++
  })

  await follower.hearing.restoreProviderModel(nextProvider)
  await vi.waitFor(() => expect(follower.hearing.activeTranscriptionModel).toBe('saved-model'))

  expect(leaderActionCount).toBe(1)
  expect(leader.hearing.activeTranscriptionModel).toBe('saved-model')
  expect(leader.hearing.activeCustomModelName).toBe('saved-model')
  expect(follower.hearing.activeCustomModelName).toBe('saved-model')
  expect(leader.hearing.getSavedProviderModel(oldProvider)).toBe('old-model')

  let leaderStateUpdates = 0
  const stopObservingLeader = leader.hearing.$subscribe(() => leaderStateUpdates++, { flush: 'sync' })
  await follower.hearing.restoreProviderModel(nextProvider)
  await new Promise(resolve => setTimeout(resolve, 50))
  stopObservingLeader()

  expect(leaderActionCount).toBe(2)
  expect(leaderStateUpdates).toBe(0)
})
