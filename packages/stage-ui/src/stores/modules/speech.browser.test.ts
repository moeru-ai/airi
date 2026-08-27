import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useSpeechStore } from './speech'

vi.mock('../providers/config', async () => {
  const { defineStore } = await import('pinia')
  return {
    useProviderConfigStore: defineStore('provider-configs', {
      state: () => ({ configuredProviders: {} }),
      actions: {
        getProviderConfig: () => ({}),
      },
    }),
  }
})

vi.mock('../providers/provider', async () => {
  const { defineStore } = await import('pinia')
  return {
    useProviderStore: defineStore('providers', {
      state: () => ({ allAudioSpeechProvidersMetadata: [] }),
      actions: {
        getModelsForProvider: () => [],
        listProviderVoices: async () => [],
        supportsModelListing: () => false,
      },
    }),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en-US' },
    t: (key: string) => key,
  }),
}))

const syncedContexts: Array<{
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
  createApp({}).use(pinia)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('speech derived voice synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
  })

  it('clears stale local voices after a remote speech tuple arrives', async () => {
    // ROOT CAUSE:
    //
    // Speech tuple snapshots replicate across windows, but VoiceInfo stays
    // renderer-local. The local watcher ignored an unresolved new voice ID,
    // so a follower retained the previous card's voice and used it for TTS.
    //
    // We fixed this by clearing the local projection when it does not match
    // the replicated provider and voice ID. This does not propose new state.
    const namespace = `speech-derived-voice:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderSpeech = useSpeechStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerSpeech = useSpeechStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const staleVoice = {
      id: 'af_heart',
      name: 'Heart',
      provider: 'kokoro-local',
      languages: [{ code: 'en', title: 'English' }],
    }
    leaderSpeech.activeSpeechVoice = staleVoice
    followerSpeech.activeSpeechVoice = staleVoice

    leaderSpeech.$patch({
      activeSpeechProvider: 'doubao-speech',
      activeSpeechModel: 'seed-icl-2.0',
      activeSpeechVoiceId: 'clone-voice',
    })

    await vi.waitFor(() => {
      expect(followerSpeech.activeSpeechProvider).toBe('doubao-speech')
      expect(followerSpeech.activeSpeechVoiceId).toBe('clone-voice')
    })
    expect(leaderSpeech.activeSpeechVoice).toBeUndefined()
    expect(followerSpeech.activeSpeechVoice).toBeUndefined()
  })
})
