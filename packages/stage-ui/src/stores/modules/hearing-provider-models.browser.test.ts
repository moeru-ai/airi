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
  localStorage.setItem(`settings/hearing/provider-model/${encodeURIComponent(nextProvider)}`, 'saved-model')
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
  expect(localStorage.getItem(`settings/hearing/provider-model/${encodeURIComponent(oldProvider)}`)).toBe('old-model')

  let leaderStateUpdates = 0
  const stopObservingLeader = leader.hearing.$subscribe(() => leaderStateUpdates++, { flush: 'sync' })
  await follower.hearing.restoreProviderModel(nextProvider)
  await new Promise(resolve => setTimeout(resolve, 50))
  stopObservingLeader()

  expect(leaderActionCount).toBe(2)
  expect(leaderStateUpdates).toBe(0)
})

it('keeps a disabled module selection when its provider model is restored', async () => {
  const namespace = `hearing:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = createContext(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  leader.hearing.activeTranscriptionProvider = 'comet-api-transcription'
  await leader.hearing.restoreProviderModel('comet-api-transcription')
  leader.hearing.activeTranscriptionModel = 'saved-model'
  leader.hearing.activeCustomModelName = 'saved-model'
  leader.hearing.enabled = false
  await vi.waitFor(() => expect(follower.hearing.enabled).toBe(false))

  await follower.hearing.restoreProviderModel('comet-api-transcription')

  expect(leader.hearing.enabled).toBe(false)
  expect(leader.hearing.activeTranscriptionProvider).toBe('comet-api-transcription')
  expect(leader.hearing.activeTranscriptionModel).toBe('saved-model')
  expect(follower.hearing.activeCustomModelName).toBe('saved-model')
})

it('does not save the removed provider again after its selection clears', async () => {
  const namespace = `hearing:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = createContext(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  const removedProvider = 'openai-compatible-audio-transcription'
  leader.hearing.activeTranscriptionProvider = removedProvider
  await leader.hearing.restoreProviderModel(removedProvider)
  leader.hearing.activeTranscriptionModel = 'removed-model'
  await vi.waitFor(() => expect(follower.hearing.activeTranscriptionModel).toBe('removed-model'))

  await follower.hearing.clearUnavailableProviderSelection()
  await vi.waitFor(() => expect(leader.hearing.activeTranscriptionProvider).toBe(''))
  leader.hearing.activeTranscriptionProvider = 'comet-api-transcription'
  await leader.hearing.restoreProviderModel('comet-api-transcription')

  expect(localStorage.getItem(`settings/hearing/provider-model/${encodeURIComponent(removedProvider)}`)).toBeNull()
})
