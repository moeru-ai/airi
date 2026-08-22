// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent } from 'vue'

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
  it('marks a listed provider invalid after its credentials are cleared', async () => {
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
    config!.apiKey = ''
    config!.baseUrl = ''

    // ROOT CAUSE: Empty credentials stopped local validation state without
    // updating the provider status kept in the shared configuration store.
    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('invalid')
    }, { timeout: 2000 })
    expect(configStore.addedProviders[providerId]).toBe(true)
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
    config!.apiKey = ''
    config!.baseUrl = ''

    await vi.waitFor(() => {
      expect(configStore.getProvider(providerId)?.status).toBe('invalid')
    }, { timeout: 2000 })
    oldValidation.resolve({ errors: [], reason: '', valid: true })
    await new Promise(resolve => setTimeout(resolve, 20))

    // ROOT CAUSE: An older request could configure a provider after a newer
    // credential snapshot had already invalidated it.
    expect(configStore.getProvider(providerId)?.status).toBe('invalid')
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
