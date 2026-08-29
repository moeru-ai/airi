// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, nextTick } from 'vue'

import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useProviderValidation } from './use-provider-validation'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: vi.fn() }),
}))

vi.mock('./use-analytics', () => ({
  useAnalytics: () => new Proxy({}, { get: () => () => {} }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useProviderValidation', () => {
  let unmount: (() => void) | undefined
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    vi.restoreAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    unmount?.()
    unmount = undefined
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809839927
  it('marks a provider configured after automatic validation succeeds', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(providersStore.validateProviderConfig).toHaveBeenCalled()
    })
    expect(configStore.getProvider(providerId)?.status).toBe('configured')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3842341595
  // ROOT CAUSE:
  //
  // Automatic validation refreshed every provider whose credentials had not been seen in
  // this process, so opening one settings page could dispose unrelated provider instances.
  it('refreshes only the provider currently being validated (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    const refreshModelsForChangedCredentials = vi.spyOn(providersStore, 'refreshModelsForChangedCredentials')
      .mockResolvedValue()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(providersStore.validateProviderConfig).toHaveBeenCalled()
    })
    expect(refreshModelsForChangedCredentials).toHaveBeenCalledWith(providerId)
  })

  it('refreshes a configured provider catalog before publishing validating status', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    await providersStore.initializeProvider(providerId)
    configStore.setProviderStatus(providerId, 'configured')
    const statusesDuringRefresh: string[] = []
    vi.spyOn(providersStore, 'refreshModelsForChangedCredentials').mockImplementation(async () => {
      statusesDuringRefresh.push(configStore.getProvider(providerId)?.status ?? 'missing')
    })
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(providersStore.validateProviderConfig).toHaveBeenCalled()
    })
    expect(statusesDuringRefresh[0]).toBe('configured')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3834928540
  it('invalidates cached providers before validation publishes success (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const cacheInvalidated = deferred<void>()
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })
    const refreshModelsForChangedCredentials = vi.spyOn(providersStore, 'refreshModelsForChangedCredentials')
      .mockReturnValue(cacheInvalidated.promise)
    let validation!: ReturnType<typeof useProviderValidation>

    const app = createApp(defineComponent({
      setup() {
        validation = useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(refreshModelsForChangedCredentials).toHaveBeenCalledOnce()
    }, { timeout: 2000 })
    expect(validation.isValid.value).toBe(false)
    expect(configStore.getProvider(providerId)?.status).not.toBe('configured')

    cacheInvalidated.resolve()
    await vi.waitFor(() => {
      expect(validation.isValid.value).toBe(true)
      expect(configStore.getProvider(providerId)?.status).toBe('configured')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3834871851
  it('publishes validation success after provider configuration is synchronized (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const configured = deferred<void>()
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })
    const configureProvider = providersStore.forceProviderConfigured.bind(providersStore)
    const forceProviderConfigured = vi.spyOn(providersStore, 'forceProviderConfigured')
      .mockImplementation(async (id) => {
        await configured.promise
        await configureProvider(id)
      })
    let validation!: ReturnType<typeof useProviderValidation>

    const app = createApp(defineComponent({
      setup() {
        validation = useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(forceProviderConfigured).toHaveBeenCalledWith(providerId)
    }, { timeout: 2000 })

    // ROOT CAUSE:
    //
    // The follower published success before the leader-routed provider action completed.
    expect(validation.isValid.value).toBe(false)
    expect(configStore.getProvider(providerId)?.status).not.toBe('configured')

    configured.resolve()
    await vi.waitFor(() => {
      expect(validation.isValid.value).toBe(true)
      expect(configStore.getProvider(providerId)?.status).toBe('configured')
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3885308453
  it('configures a continued provider before refreshing its catalog', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [new Error('offline')],
      reason: 'offline',
      valid: false,
    })
    const statusesDuringRefresh: string[] = []
    const refreshModelsForChangedCredentials = vi.spyOn(providersStore, 'refreshModelsForChangedCredentials')
      .mockImplementation(async () => {
        statusesDuringRefresh.push(configStore.getProvider(providerId)?.status ?? 'missing')
      })
    let validation!: ReturnType<typeof useProviderValidation>

    const app = createApp(defineComponent({
      setup() {
        validation = useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('invalid')
    }, { timeout: 2000 })
    statusesDuringRefresh.length = 0
    refreshModelsForChangedCredentials.mockClear()

    await validation.forceValid()

    expect(statusesDuringRefresh).toEqual(['configured'])
    expect(configStore.getProvider(providerId)?.status).toBe('configured')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3819332616
  it('automatically validates providers with provider-specific credential fields', async () => {
    const providerId = 'aliyun-nls-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    configStore.ensureProvider(providerId, providerId, {
      accessKeyId: 'access-key-id',
      accessKeySecret: 'access-key-secret',
      appKey: 'app-key',
      region: 'cn-shanghai',
    })
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(providersStore.validateProviderConfig).toHaveBeenCalled()
    }, { timeout: 2000 })
    expect(configStore.getProvider(providerId)?.status).toBe('configured')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809925335
  it('marks a listed provider unconfigured after its credentials are cleared', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('configured')
    })
    expect(configStore.addedProviders[providerId]).toBe(true)

    const config = configStore.getProviderConfig(providerId)
    expect(config).toBeDefined()
    config!.apiKey = undefined
    config!.baseUrl = undefined
    config!.model = undefined

    // ROOT CAUSE: Empty credentials stopped local validation state without
    // updating the provider status kept in the shared configuration store.
    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('unconfigured')
    }, { timeout: 2000 })
    expect(configStore.addedProviders[providerId]).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3834928546
  it('waits for unconfigured status synchronization after credentials are cleared (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const invalidStatusSynchronized = deferred<void>()
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })
    let validation!: ReturnType<typeof useProviderValidation>

    const app = createApp(defineComponent({
      setup() {
        validation = useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('configured')
    })

    const setProviderStatus = vi.spyOn(configStore, 'setProviderStatus')
      .mockImplementation(async (id, status) => {
        if (status === 'unconfigured')
          await invalidStatusSynchronized.promise
        configStore.getProvider(id)!.status = status
      })
    const config = configStore.getProviderConfig(providerId)!
    config.apiKey = undefined
    config.baseUrl = undefined
    config.model = undefined

    await vi.waitFor(() => {
      expect(setProviderStatus).toHaveBeenCalledWith(providerId, 'unconfigured')
    }, { timeout: 2000 })
    expect(configStore.getProvider(providerId)?.status).toBe('validating')
    expect(validation.isValidating.value).toBe(1)

    invalidStatusSynchronized.resolve()
    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('unconfigured')
      expect(validation.isValidating.value).toBe(0)
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3876639054
  // ROOT CAUSE: Credential edits left the synchronized provider status configured
  // until the 500 ms validation debounce expired.
  it('publishes non-ready status before debouncing edited credentials (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    vi.spyOn(providersStore, 'validateProviderConfig').mockResolvedValue({
      errors: [],
      reason: '',
      valid: true,
    })

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('configured')
    })

    const setProviderStatus = vi.spyOn(configStore, 'setProviderStatus')
    configStore.getProviderConfig(providerId)!.baseUrl = 'http://edited.example/v1/'
    await nextTick()

    expect(setProviderStatus).toHaveBeenCalledWith(providerId, 'validating')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809925335
  it('marks a listed provider invalid when automatic revalidation fails', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    const validateProviderConfig = vi.spyOn(providersStore, 'validateProviderConfig')
      .mockResolvedValue({ errors: [], reason: '', valid: true })

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('configured')
    })
    expect(configStore.addedProviders[providerId]).toBe(true)
    validateProviderConfig.mockResolvedValue({
      errors: [],
      reason: 'unreachable endpoint',
      valid: false,
    })

    const config = configStore.getProviderConfig(providerId)
    expect(config).toBeDefined()
    config!.baseUrl = 'http://unreachable.example/v1/'

    // ROOT CAUSE: Failed automatic validation only changed the composable ref,
    // leaving the shared provider status configured.
    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('invalid')
    }, { timeout: 2000 })
    expect(configStore.addedProviders[providerId]).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809925335
  it('ignores an old successful validation after credentials are cleared', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    const oldValidation = deferred<{ errors: never[], reason: string, valid: boolean }>()
    vi.spyOn(providersStore, 'validateProviderConfig').mockReturnValue(oldValidation.promise)

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(providersStore.validateProviderConfig).toHaveBeenCalledTimes(1)
    }, { timeout: 2000 })
    configStore.markProviderAdded(providerId)
    const config = configStore.getProviderConfig(providerId)
    expect(config).toBeDefined()
    config!.apiKey = undefined
    config!.baseUrl = undefined
    config!.model = undefined

    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('unconfigured')
    }, { timeout: 2000 })
    oldValidation.resolve({ errors: [], reason: '', valid: true })
    await new Promise(resolve => setTimeout(resolve, 20))

    // ROOT CAUSE: An older request could configure a provider after a newer
    // credential snapshot had already marked it unconfigured.
    expect(configStore.getProvider(providerId)?.status).toBe('unconfigured')
    expect(configStore.addedProviders[providerId]).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809925335
  it('ignores an old failed validation after newer credentials succeed', async () => {
    const providerId = 'funasr-audio-transcription'
    const providersStore = useProviderStore()
    const configStore = useProviderConfigStore()
    configStore.resetProviders()
    const oldValidation = deferred<{ errors: never[], reason: string, valid: boolean }>()
    const newValidation = deferred<{ errors: never[], reason: string, valid: boolean }>()
    vi.spyOn(providersStore, 'validateProviderConfig')
      .mockReturnValueOnce(oldValidation.promise)
      .mockReturnValueOnce(newValidation.promise)

    const app = createApp(defineComponent({
      setup() {
        useProviderValidation(providerId)
        return () => null
      },
    }))
    app.use(pinia)
    app.mount(document.createElement('div'))
    unmount = () => app.unmount()

    await vi.waitFor(() => {
      expect(providersStore.validateProviderConfig).toHaveBeenCalledTimes(1)
    }, { timeout: 2000 })
    const config = configStore.getProviderConfig(providerId)
    expect(config).toBeDefined()
    config!.baseUrl = 'http://new-endpoint.example/v1/'
    await vi.waitFor(() => {
      expect(providersStore.validateProviderConfig).toHaveBeenCalledTimes(2)
    }, { timeout: 2000 })

    newValidation.resolve({ errors: [], reason: '', valid: true })
    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('configured')
    })
    oldValidation.resolve({ errors: [], reason: 'old endpoint failed', valid: false })
    await new Promise(resolve => setTimeout(resolve, 20))

    // ROOT CAUSE: An older failed request could invalidate a provider after a
    // newer credential snapshot had already configured it.
    expect(configStore.getProvider(providerId)?.status).toBe('configured')
  })
})
