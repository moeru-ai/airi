import type { PluginManifestSummary, PluginRegistrySnapshot } from '../../shared/eventa/plugin/host'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMocks = vi.hoisted(() => {
  const emptySnapshot = { root: 'plugins', plugins: [] as PluginManifestSummary[] }

  return {
    list: vi.fn<() => Promise<PluginRegistrySnapshot>>(async () => emptySnapshot),
    setEnabled: vi.fn<(payload: { extensionId: string, enabled: boolean, path?: string }) => Promise<PluginRegistrySnapshot>>(async () => emptySnapshot),
    load: vi.fn<(payload: { extensionId: string }) => Promise<PluginRegistrySnapshot>>(async () => emptySnapshot),
    unload: vi.fn<(payload: { extensionId: string }) => Promise<PluginRegistrySnapshot>>(async () => emptySnapshot),
    openFolder: vi.fn<() => Promise<{ path: string }>>(async () => ({ path: 'plugins' })),
  }
})

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    switch (event?.receiveEvent?.id) {
      case 'eventa:invoke:electron:plugins:list-receive':
        return invokeMocks.list
      case 'eventa:invoke:electron:plugins:set-enabled-receive':
        return invokeMocks.setEnabled
      case 'eventa:invoke:electron:plugins:load-receive':
        return invokeMocks.load
      case 'eventa:invoke:electron:plugins:unload-receive':
        return invokeMocks.unload
      case 'eventa:invoke:electron:plugins:open-folder-receive':
        return invokeMocks.openFolder
      default:
        throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
    }
  },
}))

function createPluginSummary(overrides: Partial<PluginManifestSummary> = {}): PluginManifestSummary {
  return {
    extensionId: 'test-plugin',
    version: '0.0.0',
    entrypoints: { electron: './index.mjs' },
    path: 'plugins/test-plugin/extension.airi.json',
    enabled: false,
    autoReload: false,
    loaded: false,
    isNew: false,
    ...overrides,
  }
}

function createSnapshot(...plugins: PluginManifestSummary[]): PluginRegistrySnapshot {
  return { root: 'plugins', plugins }
}

describe('usePluginsStore', async () => {
  const { usePluginsStore } = await import('./plugins')
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    for (const mock of Object.values(invokeMocks)) {
      mock.mockReset()
    }
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
  })

  it('does not reload a disabled plugin', async () => {
    invokeMocks.list.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: false })))

    const store = usePluginsStore()
    await store.refresh()

    // ROOT CAUSE:
    //
    // Reload ran unload and load for every named plugin. The main process
    // loads a disabled plugin on request, so reloading a disabled plugin
    // produced a disabled but loaded plugin.
    //
    // We fixed this by refusing the reload command for disabled plugins.
    await expect(store.reload('test-plugin')).rejects.toThrow('Cannot reload disabled plugin: test-plugin')

    expect(invokeMocks.unload).not.toHaveBeenCalled()
    expect(invokeMocks.load).not.toHaveBeenCalled()
    expect(store.pendingExtensionId).toBeUndefined()
    expect(store.loading).toBe(false)
  })

  it('reloads an enabled plugin by unloading it before loading it again', async () => {
    invokeMocks.list.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: true })))
    invokeMocks.unload.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: false })))
    invokeMocks.load.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: true })))

    const store = usePluginsStore()
    await store.refresh()

    await store.reload('test-plugin')

    expect(invokeMocks.unload).toHaveBeenCalledWith({ extensionId: 'test-plugin' })
    expect(invokeMocks.load).toHaveBeenCalledWith({ extensionId: 'test-plugin' })
    expect(invokeMocks.unload.mock.invocationCallOrder[0]).toBeLessThan(invokeMocks.load.mock.invocationCallOrder[0])
    expect(store.plugins).toEqual([expect.objectContaining({ extensionId: 'test-plugin', enabled: true, loaded: true })])
    expect(store.pendingExtensionId).toBeUndefined()
    expect(store.loading).toBe(false)
  })

  it('reloads an enabled plugin that is not loaded', async () => {
    invokeMocks.list.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: false })))
    invokeMocks.unload.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: false })))
    invokeMocks.load.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: true })))

    const store = usePluginsStore()
    await store.refresh()

    await store.reload('test-plugin')

    expect(invokeMocks.unload).toHaveBeenCalledWith({ extensionId: 'test-plugin' })
    expect(invokeMocks.load).toHaveBeenCalledWith({ extensionId: 'test-plugin' })
    expect(store.plugins).toEqual([expect.objectContaining({ extensionId: 'test-plugin', enabled: true, loaded: true })])
  })

  it('unloads before it persists the disabled state', async () => {
    invokeMocks.list.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: true })))
    invokeMocks.unload.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: false })))
    invokeMocks.setEnabled.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: false, loaded: false })))

    const store = usePluginsStore()
    await store.refresh()

    await store.disableAndUnload('test-plugin')

    expect(invokeMocks.unload.mock.invocationCallOrder[0]).toBeLessThan(invokeMocks.setEnabled.mock.invocationCallOrder[0])
    expect(invokeMocks.setEnabled).toHaveBeenCalledWith({ extensionId: 'test-plugin', enabled: false, path: undefined })
    expect(store.plugins).toEqual([expect.objectContaining({ extensionId: 'test-plugin', enabled: false, loaded: false })])
    expect(store.loading).toBe(false)
    expect(store.pendingExtensionId).toBeUndefined()
  })

  it('keeps the plugin enabled when unload fails during disable', async () => {
    invokeMocks.list.mockResolvedValue(createSnapshot(createPluginSummary({ enabled: true, loaded: true })))
    invokeMocks.unload.mockRejectedValue(new Error('unload failed'))

    const store = usePluginsStore()
    await store.refresh()

    // ROOT CAUSE:
    //
    // Disable persisted `enabled: false` before it unloaded the session. If
    // unload failed, the plugin kept running although it was disabled.
    //
    // We fixed this by unloading before the store persists the disabled state.
    await expect(store.disableAndUnload('test-plugin')).rejects.toThrow('unload failed')

    expect(invokeMocks.setEnabled).not.toHaveBeenCalled()
    expect(store.plugins).toEqual([expect.objectContaining({ extensionId: 'test-plugin', enabled: true, loaded: true })])
  })
})
