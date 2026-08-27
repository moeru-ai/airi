import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHearingStore } from '../stores/modules/hearing'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useDataMaintenance } from './use-data-maintenance'

const externalVisualStores = vi.hoisted(() => ({
  generic: {},
  live2dParams: { resetState: vi.fn() },
  live2dSettings: { resetState: vi.fn() },
  models: { resetModelStore: vi.fn() },
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isStageCapacitor: () => false,
  isStageTamagotchi: () => false,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
    t: (key: string) => key,
  }),
}))

vi.mock('./use-analytics', () => ({
  useAnalytics: () => new Proxy({}, { get: () => () => {} }),
}))

vi.mock('@proj-airi/stage-ui-live2d', () => ({
  useLive2dParams: () => externalVisualStores.live2dParams,
  useSettingsLive2d: () => externalVisualStores.live2dSettings,
}))

vi.mock('@proj-airi/stage-ui-three', () => ({
  useModelStore: () => externalVisualStores.models,
}))

vi.mock('../stores/chat', () => ({ useChatStore: () => externalVisualStores.generic }))
vi.mock('../stores/chat/session-store', () => ({ useChatSessionStore: () => externalVisualStores.generic }))
vi.mock('../stores/display-models', () => ({ useDisplayModelsStore: () => externalVisualStores.generic }))
vi.mock('../stores/mcp', () => ({ useMcpStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/airi-card', () => ({ useAiriCardStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/consciousness', () => ({ useConsciousnessStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/consciousness-settings', () => ({ useConsciousnessSettingsStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/discord', () => ({ useDiscordStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/gaming-factorio', () => ({ useFactorioStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/gaming-minecraft', () => ({ useMinecraftStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/speech', () => ({ useSpeechStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/twitter', () => ({ useTwitterStore: () => externalVisualStores.generic }))
vi.mock('../stores/modules/web-search', () => ({ useWebSearchStore: () => externalVisualStores.generic }))
vi.mock('../stores/onboarding', () => ({ useOnboardingStore: () => externalVisualStores.generic }))
vi.mock('../stores/settings', () => ({
  useSettings: () => externalVisualStores.generic,
  useSettingsAudioDevice: () => externalVisualStores.generic,
}))

describe('useDataMaintenance', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3837554089
  // ROOT CAUSE:
  //
  // Provider reset deleted the generated provider and its definition mapping. Hearing then tried
  // to reload the deleted id, so the reset stopped before the remaining application data reset.
  it('clears a generated Hearing selection before provider reset (GitHub #2122)', async () => {
    const providerId = 'generated-openai-compatible-transcription'
    const providerConfigStore = useProviderConfigStore()
    const providersStore = useProviderStore()
    providerConfigStore.ensureProvider(providerId, 'openai-compatible-audio-transcription', {
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'whisper-1',
    })
    await providersStore.initializeProvider(providerId)

    const hearingStore = useHearingStore()
    await hearingStore.setActiveTranscriptionProvider(providerId, 'whisper-1')

    await useDataMaintenance().resetProvidersSettings()

    expect(providerConfigStore.getProvider(providerId)).toBeUndefined()
    expect(hearingStore.activeTranscriptionProvider).toBe('')
  })
})
