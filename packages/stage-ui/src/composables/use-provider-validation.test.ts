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
})
