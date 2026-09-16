import { createPinia, disposePinia, setActivePinia } from 'pinia'
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
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    invokeMocks.getConfig.mockClear()
    invokeMocks.applyConfig.mockClear()
    toastError.mockClear()
  })

  afterEach(() => {
    disposePinia(pinia)
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

  it('publishes the applied config only after the main process accepts the change', async () => {
    let resolveApply: ((config: {
      authToken: string
      hostname: string
      tlsConfig: Record<string, never> | null
    }) => void) | undefined
    invokeMocks.applyConfig.mockImplementationOnce(async () => await new Promise((resolve) => {
      resolveApply = resolve
    }))

    const store = useServerChannelSettingsStore()

    await vi.waitFor(() => {
      expect(store.appliedConfig).toEqual({
        authToken: 'existing-token',
        hostname: '127.0.0.1',
        tlsConfig: null,
      })
    })

    store.hostname = '0.0.0.0'
    await nextTick()

    // ROOT CAUSE:
    //
    // The QR card watched the optimistic hostname and requested its payload
    // while the main process still restarted the server with the new config.
    // The request read the old loopback config and failed. The accepted config
    // did not change the hostname again, so the QR card never retried.
    // We fixed this by publishing the accepted config after the IPC request
    // completes. The QR card watches that accepted snapshot.
    expect(store.appliedConfig).toEqual({
      authToken: 'existing-token',
      hostname: '127.0.0.1',
      tlsConfig: null,
    })

    resolveApply?.({
      authToken: 'existing-token',
      hostname: '0.0.0.0',
      tlsConfig: null,
    })

    await vi.waitFor(() => {
      expect(store.appliedConfig).toEqual({
        authToken: 'existing-token',
        hostname: '0.0.0.0',
        tlsConfig: null,
      })
    })
  })
})
