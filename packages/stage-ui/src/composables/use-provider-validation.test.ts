import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isReactive, ref } from 'vue'

import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useProviderValidation } from './use-provider-validation'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    locale: ref('en'),
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

describe('useProviderValidation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ROOT CAUSE:
  //
  // Speech provider settings pages never ran credential validation, so
  // entering an API key left the provider status at 'unconfigured' forever.
  // Module pages (e.g. settings/modules/speech) only list configured
  // providers, so a freshly added speech provider could never be selected as
  // the speech module.
  //
  // We fixed this by wiring useProviderValidation into the shared
  // SpeechProviderSettings component; a successful validation now marks the
  // provider as configured and added.
  it('marks a credential-based speech provider as configured and added after validation succeeds', async () => {
    const configStore = useProviderConfigStore()
    useProviderStore()

    configStore.ensureProvider('doubao-speech', 'doubao-speech', {})

    const { isValid } = useProviderValidation('doubao-speech')

    const config = configStore.getProviderConfig('doubao-speech')!
    config.apiKey = 'test-api-key'
    config.speaker = 'zh_female_cancan_mars_bigtts'

    await vi.waitFor(() => {
      expect(isValid.value).toBe(true)
    }, { timeout: 5000 })

    expect(configStore.getProvider('doubao-speech')?.status).toBe('configured')
    expect(configStore.addedProviders['doubao-speech']).toBe(true)
  })

  // Credential-free providers (local and browser runtimes) own their
  // availability through `requiresCredentials: false`, not through validation
  // status. Resetting their status when validation is skipped would fight the
  // lifecycle that owns it.
  it('keeps the owned status untouched when validation is skipped for credential-free providers', async () => {
    const configStore = useProviderConfigStore()
    useProviderStore()

    configStore.ensureProvider('kokoro-local', 'kokoro-local', {})
    configStore.setProviderStatus('kokoro-local', 'configured')

    useProviderValidation('kokoro-local', { resetStatusWhenValidationSkipped: false })

    const config = configStore.getProviderConfig('kokoro-local')!
    config.model = 'kokoro-v1'

    // The skip branch is debounced by 500 ms; wait long enough for it to run.
    await new Promise(resolve => setTimeout(resolve, 1500))

    expect(configStore.getProvider('kokoro-local')?.status).toBe('configured')
  })

  // ROOT CAUSE:
  //
  // validateProviderConfig is a synced action: on follower windows its
  // arguments cross the BroadcastChannel boundary with structuredClone. The
  // config used to be built by spreading the reactive store object, which
  // leaks nested Vue proxies, and structuredClone rejects them with
  // "could not be cloned". The validation error alert on the Doubao speech
  // settings page surfaced this as "Failed to execute 'postMessage' on
  // 'BroadcastChannel'".
  //
  // We fixed this by snapshotting with structuredClone(toRaw(...)) before
  // calling the synced action.
  it('passes a structuredClone-safe config snapshot to the synced validation action', async () => {
    const configStore = useProviderConfigStore()
    const providerStore = useProviderStore()

    configStore.ensureProvider('doubao-speech', 'doubao-speech', {})

    const validateSpy = vi.spyOn(providerStore, 'validateProviderConfig')

    useProviderValidation('doubao-speech')

    const config = configStore.getProviderConfig('doubao-speech')!
    config.apiKey = 'test-api-key'
    config.speaker = 'zh_female_cancan_mars_bigtts'
    // Nested objects become reactive proxies inside the store; they are the
    // values that break structuredClone when spread shallowly.
    config.audio = { format: 'mp3' }

    await vi.waitFor(() => {
      expect(validateSpy).toHaveBeenCalled()
    }, { timeout: 5000 })

    const passedConfig = validateSpy.mock.calls[0][1] as Record<string, unknown>
    expect(isReactive(passedConfig.audio)).toBe(false)
    expect(() => structuredClone(passedConfig)).not.toThrow()
  })

  it('resets status to unconfigured by default when validation is skipped', async () => {
    const configStore = useProviderConfigStore()
    useProviderStore()

    configStore.ensureProvider('kokoro-local', 'kokoro-local', {})
    configStore.setProviderStatus('kokoro-local', 'configured')

    useProviderValidation('kokoro-local')

    const config = configStore.getProviderConfig('kokoro-local')!
    config.model = 'kokoro-v1'

    await vi.waitFor(() => {
      expect(configStore.getProvider('kokoro-local')?.status).toBe('unconfigured')
    }, { timeout: 5000 })
  })
})
