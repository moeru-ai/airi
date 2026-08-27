import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useAiriCardStore } from './airi-card'
import { useSpeechStore } from './speech'

vi.mock('./artistry', async () => {
  const { defineStore } = await import('pinia')
  return {
    useArtistryStore: defineStore('artistry', {
      state: () => ({
        activeProvider: '',
        activeModel: '',
        defaultPromptPrefix: '',
        providerOptions: {},
      }),
      actions: { resetToGlobal() {} },
    }),
  }
})

vi.mock('./consciousness', async () => {
  const { defineStore } = await import('pinia')
  return { useConsciousnessStore: defineStore('consciousness', { state: () => ({ activeProvider: '', activeModel: '' }) }) }
})

vi.mock('./speech', async () => {
  const { defineStore } = await import('pinia')
  return {
    useSpeechStore: defineStore('speech', {
      state: () => ({
        activeSpeechProvider: 'kokoro-local',
        activeSpeechModel: 'kokoro-82m',
        activeSpeechVoice: undefined,
        activeSpeechVoiceId: 'af_heart',
      }),
      synced: { state: true },
    }),
  }
})

vi.mock('./vision', async () => {
  const { defineStore } = await import('pinia')
  return { useVisionStore: defineStore('vision', { state: () => ({ activeProvider: '', activeModel: '' }) }) }
})

vi.mock('../settings/stage-model', async () => {
  const { defineStore } = await import('pinia')
  return { useSettingsStageModel: defineStore('stage-model', { state: () => ({ stageModelSelected: '' }) }) }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
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

describe('airi card speech selection synchronization', () => {
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

  // ROOT CAUSE:
  //
  // A follower changed the synchronized speech store, then a page watcher sent
  // the replicated tuple to the synchronized card store. Interleaved full-state
  // proposals let an older Kokoro tuple overwrite a newer Doubao selection.
  //
  // We fixed this by committing the runtime and card tuples in one leader-owned
  // command. A later runtime snapshot is not treated as another card command.
  it('commits one selection and ignores replicated runtime state as a card edit', async () => {
    const namespace = `airi-card-speech:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderSpeech = useSpeechStore()
    const leaderCard = useAiriCardStore()
    await leaderCard.initialize()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerSpeech = useSpeechStore()
    const followerCard = useAiriCardStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerCard.cards.has('default')).toBe(true))

    await followerCard.selectActiveCardSpeech({
      provider: 'doubao-speech',
      model: 'seed-tts-2.0',
      voice_id: 'zh_female_vv_uranus_bigtts',
    })

    await vi.waitFor(() => {
      expect(leaderSpeech.activeSpeechProvider).toBe('doubao-speech')
      expect(followerSpeech.activeSpeechProvider).toBe('doubao-speech')
      expect(followerCard.activeCard?.extensions.airi.modules.speech?.provider).toBe('doubao-speech')
    })

    leaderSpeech.$patch({
      activeSpeechProvider: 'kokoro-local',
      activeSpeechModel: 'kokoro-82m',
      activeSpeechVoiceId: 'af_heart',
    })

    await vi.waitFor(() => expect(followerSpeech.activeSpeechProvider).toBe('kokoro-local'))
    expect(leaderCard.activeCard?.extensions.airi.modules.speech?.provider).toBe('doubao-speech')
    expect(followerCard.activeCard?.extensions.airi.modules.speech?.provider).toBe('doubao-speech')
  })
})
