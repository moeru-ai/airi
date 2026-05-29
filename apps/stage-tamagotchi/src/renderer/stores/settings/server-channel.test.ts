import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const invokeMocks = vi.hoisted(() => {
  const getConfig = vi.fn(async () => ({
    authToken: 'existing-token',
    hostname: '127.0.0.1',
    tlsConfig: null,
  }))
  const applyConfig = vi.fn(async (config: unknown) => config)

  return {
    applyConfig,
    getConfig,
  }
})

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:server-channel:get-config-receive')
      return invokeMocks.getConfig
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:server-channel:apply-config-receive')
      return invokeMocks.applyConfig

    throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
  },
}))

vi.mock('@vueuse/core', () => ({
  useLocalStorage: <T>(key: string, initialValue: T) => {
    if (key === 'settings/server-channel/hostname')
      return ref('127.0.0.1')
    if (key === 'settings/server-channel/auth-token')
      return ref('existing-token')
    if (key === 'settings/server-channel/websocket-tls-config')
      return ref(null)

    return ref(initialValue)
  },
}))

const toastError = vi.fn()

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastError,
  },
}))

describe('useServerChannelSettingsStore', async () => {
  const { useServerChannelSettingsStore } = await import('./server-channel')

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMocks.getConfig.mockClear()
    invokeMocks.applyConfig.mockClear()
    toastError.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rolls back optimistic values when applying server channel config fails', async () => {
    invokeMocks.applyConfig.mockRejectedValueOnce(new Error('apply failed'))

    const store = useServerChannelSettingsStore()
    await Promise.resolve()

    store.hostname = '0.0.0.0'
    store.authToken = 'next-token'
    store.tlsConfig = {}
    await nextTick()

    await vi.waitFor(() => {
      expect(store.hostname).toBe('127.0.0.1')
      expect(store.authToken).toBe('existing-token')
      expect(store.tlsConfig).toBeNull()
      expect(store.lastApplyError).toBe('apply failed')
      expect(toastError).toHaveBeenCalledWith('apply failed')
    })
  })
})
