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

  // ROOT CAUSE:
  //
  // Automatic validation allowed requests for different configuration
  // snapshots to overlap. An older request could finish last and replace the
  // status for the current configuration.
  //
  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3874910005
  //
  // We fixed this by invalidating the active request as soon as credentials
  // change. Only the latest request can commit its result.
  it('ignores an older validation result after the configuration changes', async () => {
    const configStore = useProviderConfigStore()
    const providerStore = useProviderStore()

    configStore.ensureProvider('doubao-speech', 'doubao-speech', {})

    type ValidationResult = Awaited<ReturnType<typeof providerStore.validateProviderConfig>>
    let resolveOlderValidation!: (value: ValidationResult) => void
    let resolveNewerValidation!: (value: ValidationResult) => void
    const olderValidation = new Promise<ValidationResult>((resolve) => {
      resolveOlderValidation = resolve
    })
    const newerValidation = new Promise<ValidationResult>((resolve) => {
      resolveNewerValidation = resolve
    })

    const validateSpy = vi.spyOn(providerStore, 'validateProviderConfig')
      .mockImplementation(async (_providerId, config) => {
        return config.apiKey === 'older-api-key'
          ? olderValidation
          : newerValidation
      })

    const { isValid } = useProviderValidation('doubao-speech')
    const config = configStore.getProviderConfig('doubao-speech')!
    config.apiKey = 'older-api-key'
    config.speaker = 'zh_female_cancan_mars_bigtts'

    await vi.waitFor(() => {
      expect(validateSpy).toHaveBeenCalledTimes(1)
    }, { timeout: 5000 })

    config.apiKey = 'newer-api-key'
    await vi.waitFor(() => {
      expect(validateSpy).toHaveBeenCalledTimes(2)
    }, { timeout: 5000 })

    resolveNewerValidation({ errors: [], reason: 'New configuration is invalid', valid: false })
    await vi.waitFor(() => {
      expect(configStore.getProvider('doubao-speech')?.status).toBe('invalid')
    })

    resolveOlderValidation({ errors: [], reason: '', valid: true })
    await olderValidation
    await Promise.resolve()

    expect(configStore.getProvider('doubao-speech')?.status).toBe('invalid')
    expect(isValid.value).toBe(false)
  })

  // ROOT CAUSE:
  //
  // Every validation generation incremented one shared loading counter. A
  // stalled obsolete request kept the counter above zero after the current
  // request finished, so the page continued to show its loading state.
  //
  // We fixed this by assigning loading ownership to the current generation.
  // An obsolete request cannot retain or clear the current loading state.
  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3876749650
  it('clears PR #2382 validation loading when the current generation finishes', async () => {
    const configStore = useProviderConfigStore()
    const providerStore = useProviderStore()

    configStore.ensureProvider('doubao-speech', 'doubao-speech', {})

    type ValidationResult = Awaited<ReturnType<typeof providerStore.validateProviderConfig>>
    let resolveOlderValidation!: (value: ValidationResult) => void
    let resolveNewerValidation!: (value: ValidationResult) => void
    const olderValidation = new Promise<ValidationResult>((resolve) => {
      resolveOlderValidation = resolve
    })
    const newerValidation = new Promise<ValidationResult>((resolve) => {
      resolveNewerValidation = resolve
    })
    const validateSpy = vi.spyOn(providerStore, 'validateProviderConfig')
      .mockImplementation(async (_providerId, config) => {
        return config.apiKey === 'older-api-key'
          ? olderValidation
          : newerValidation
      })

    const validation = useProviderValidation('doubao-speech')
    const config = configStore.getProviderConfig('doubao-speech')!
    config.apiKey = 'older-api-key'
    config.speaker = 'zh_female_cancan_mars_bigtts'

    await vi.waitFor(() => {
      expect(validateSpy).toHaveBeenCalledTimes(1)
      expect(validation.isValidating.value).toBeGreaterThan(0)
    }, { timeout: 5000 })

    config.apiKey = 'newer-api-key'
    await vi.waitFor(() => {
      expect(validateSpy).toHaveBeenCalledTimes(2)
    }, { timeout: 5000 })

    resolveNewerValidation({ errors: [], reason: 'New configuration is invalid', valid: false })
    await vi.waitFor(() => {
      expect(configStore.getProvider('doubao-speech')?.status).toBe('invalid')
      expect(validation.isValidating.value).toBe(0)
    }, { timeout: 5000 })

    resolveOlderValidation({ errors: [], reason: '', valid: true })
    await olderValidation
  })

  // ROOT CAUSE:
  //
  // A manual connection test kept running after credentials changed. Its old
  // result could restore the success state for credentials that it never
  // tested.
  //
  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3875228109
  //
  // We fixed this by giving manual tests a separate generation. Credential
  // changes invalidate the pending result immediately.
  it('ignores a manual test result after the configuration changes', async () => {
    const configStore = useProviderConfigStore()
    const providerStore = useProviderStore()

    configStore.ensureProvider('doubao-speech', 'doubao-speech', {
      apiKey: 'older-api-key',
      speaker: 'zh_female_cancan_mars_bigtts',
    })

    type ValidationResult = Awaited<ReturnType<typeof providerStore.validateProviderConfig>>
    let resolveManualValidation!: (value: ValidationResult) => void
    const manualValidation = new Promise<ValidationResult>((resolve) => {
      resolveManualValidation = resolve
    })
    const validateSpy = vi.spyOn(providerStore, 'validateProviderConfig')
      .mockImplementation(async () => manualValidation)

    const validation = useProviderValidation('doubao-speech')
    await vi.waitFor(() => {
      expect(validation.providerMetadata.value).toBeDefined()
    })

    const pendingTest = validation.runManualTest()
    await vi.waitFor(() => {
      expect(validateSpy).toHaveBeenCalledTimes(1)
    })

    const config = configStore.getProviderConfig('doubao-speech')!
    config.apiKey = 'newer-api-key'
    resolveManualValidation({ errors: [], reason: '', valid: true })
    await pendingTest

    expect(validation.manualTestPassed.value).toBe(false)
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
