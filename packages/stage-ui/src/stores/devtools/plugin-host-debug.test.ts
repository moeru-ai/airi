import type { ExtensionDirectoryImportPrepareResult, PluginHostDebugSnapshot, PluginRegistrySnapshot } from '@proj-airi/stage-shared/plugin-host'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePluginHostInspectorStore } from './plugin-host-debug'

function createRegistry(enabled: boolean, loaded: boolean): PluginRegistrySnapshot {
  return {
    root: 'extensions/v1',
    plugins: [{
      extensionId: 'sample-plugin',
      entrypoints: { electron: './index.mjs' },
      path: 'sample-plugin/extension.airi.json',
      enabled,
      loaded,
      autoReload: false,
      isNew: false,
    }],
  }
}

function createBridge(registry: PluginRegistrySnapshot) {
  const snapshot: PluginHostDebugSnapshot = {
    registry,
    sessions: registry.plugins.filter(plugin => plugin.loaded).map(plugin => ({
      id: 'sample-session',
      extensionId: plugin.extensionId,
      phase: 'ready',
      runtime: 'electron',
      moduleId: plugin.extensionId,
    })),
    kits: [],
    modules: [],
    capabilities: [],
    refreshedAt: 1,
  }

  return {
    prepareDirectoryImport: vi.fn(async (): Promise<ExtensionDirectoryImportPrepareResult> => ({ status: 'cancelled' })),
    commitDirectoryImport: vi.fn(async () => registry),
    cancelDirectoryImport: vi.fn(async () => {}),
    list: vi.fn(async () => registry),
    setEnabled: vi.fn(async () => registry),
    setAutoReload: vi.fn(async () => registry),
    loadEnabled: vi.fn(async () => registry),
    load: vi.fn(async () => registry),
    unload: vi.fn(async () => registry),
    inspect: vi.fn(async () => snapshot),
  }
}

describe.each([
  { action: 'enableAndLoad' as const, runtimeAction: 'load' as const, enabled: true },
  { action: 'disableAndUnload' as const, runtimeAction: 'unload' as const, enabled: false },
])('$action', ({ action, runtimeAction, enabled }) => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('saves enablement before changing runtime state and stays busy through inspection', async () => {
    const finalRegistry = createRegistry(enabled, enabled)
    const bridge = createBridge(finalRegistry)
    const save = Promise.withResolvers<PluginRegistrySnapshot>()
    const runtime = Promise.withResolvers<PluginRegistrySnapshot>()
    const inspection = Promise.withResolvers<void>()
    const inspect = bridge.inspect.getMockImplementation()!
    bridge.setEnabled.mockReturnValueOnce(save.promise)
    bridge[runtimeAction].mockReturnValueOnce(runtime.promise)
    bridge.inspect.mockImplementationOnce(async () => {
      await inspection.promise
      return inspect()
    })

    const store = usePluginHostInspectorStore()
    store.setBridge(bridge)
    const operation = store[action]({
      extensionId: 'sample-plugin',
      path: 'sample-plugin/extension.airi.json',
    })

    expect(store.loading).toBe(true)
    expect(bridge.setEnabled).toHaveBeenCalledExactlyOnceWith({
      extensionId: 'sample-plugin',
      path: 'sample-plugin/extension.airi.json',
      enabled,
    })
    expect(bridge[runtimeAction]).not.toHaveBeenCalled()

    const savedRegistry = createRegistry(enabled, !enabled)
    save.resolve(savedRegistry)
    await vi.waitFor(() => expect(bridge[runtimeAction]).toHaveBeenCalledExactlyOnceWith({ extensionId: 'sample-plugin' }))
    expect(store.registry).toEqual(savedRegistry)
    expect(store.loading).toBe(true)
    expect(bridge.inspect).not.toHaveBeenCalled()

    runtime.resolve(finalRegistry)
    await vi.waitFor(() => expect(bridge.inspect).toHaveBeenCalledOnce())
    expect(store.registry).toEqual(finalRegistry)
    expect(store.loading).toBe(true)

    inspection.resolve()
    await expect(operation).resolves.toEqual(finalRegistry)
    expect(store.sessions).toHaveLength(enabled ? 1 : 0)
    expect(store.refreshedAt).toBe(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeUndefined()
  })

  it('does not change runtime state when saving enablement fails', async () => {
    const bridge = createBridge(createRegistry(!enabled, !enabled))
    bridge.setEnabled.mockRejectedValueOnce(new Error('Could not save enablement.'))
    const store = usePluginHostInspectorStore()
    store.setBridge(bridge)

    await expect(store[action]({ extensionId: 'sample-plugin' })).rejects.toThrow('Could not save enablement.')

    expect(bridge[runtimeAction]).not.toHaveBeenCalled()
    expect(bridge.inspect).not.toHaveBeenCalled()
    expect(store.error).toBe('Could not save enablement.')
    expect(store.loading).toBe(false)
  })

  it('keeps the saved enablement visible when the runtime operation fails', async () => {
    const savedRegistry = createRegistry(enabled, !enabled)
    const bridge = createBridge(savedRegistry)
    bridge[runtimeAction].mockRejectedValueOnce(new Error('Runtime operation failed.'))
    const store = usePluginHostInspectorStore()
    store.setBridge(bridge)

    await expect(store[action]({ extensionId: 'sample-plugin' })).rejects.toThrow('Runtime operation failed.')

    expect(bridge.setEnabled).toHaveBeenCalledOnce()
    expect(store.registry).toEqual(savedRegistry)
    expect(store.error).toBe('Runtime operation failed.')
    expect(store.loading).toBe(false)
  })
})

describe('extension folder import', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns a reviewed plan without changing the registry', async () => {
    const registry = createRegistry(false, false)
    const bridge = createBridge(registry)
    bridge.prepareDirectoryImport.mockResolvedValueOnce({
      status: 'ready',
      plan: {
        planId: 'plan-1',
        sourcePath: '/selected/example-extension',
        extensionId: 'example-extension',
        version: '1.0.0',
        runtimes: ['electron'],
        entrypoints: { electron: './extension.mjs' },
        permissions: [],
        kits: [],
        fileCount: 2,
        totalBytes: 128,
        fingerprint: 'fingerprint',
        createdAt: 1,
      },
    })
    const store = usePluginHostInspectorStore()
    store.setBridge(bridge)

    const result = await store.prepareDirectoryImport()

    expect(result).toMatchObject({ status: 'ready', plan: { extensionId: 'example-extension' } })
    expect(store.registry).toBeUndefined()
  })

  it('stores the disabled registry snapshot after commit and refreshes inspection', async () => {
    const registry = createRegistry(false, false)
    const bridge = createBridge(registry)
    const store = usePluginHostInspectorStore()
    store.setBridge(bridge)

    await store.commitDirectoryImport({ planId: 'plan-1' })

    expect(bridge.commitDirectoryImport).toHaveBeenCalledExactlyOnceWith({ planId: 'plan-1' })
    expect(bridge.inspect).toHaveBeenCalledOnce()
    expect(store.registry).toEqual(registry)
  })
})
