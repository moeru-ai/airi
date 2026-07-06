import { beforeEach, describe, expect, it } from 'vitest'

import { createPinia, setActivePinia } from 'pinia'

import { usePluginHostInspectorStore } from './plugin-host-debug'

describe('usePluginHostInspectorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('preserves sidecar status from inspection snapshots', async () => {
    const store = usePluginHostInspectorStore()
    const registry = { plugins: [], root: '/tmp/airi/plugins' }
    const sidecar = {
      endpoint: 'http://127.0.0.1:49152',
      executablePath: '/tmp/plugin-host',
      lastError: undefined,
      pid: 42,
      state: 'ready' as const,
      updatedAt: 123,
    }

    store.setBridge({
      inspect: async () => ({
        capabilities: [],
        kits: [],
        modules: [],
        refreshedAt: 456,
        registry,
        sessions: [],
        sidecar,
      }),
      list: async () => registry,
      load: async () => registry,
      loadEnabled: async () => registry,
      setAutoReload: async () => registry,
      setEnabled: async () => registry,
      unload: async () => registry,
    })

    await store.refreshInspection()

    expect(store.sidecar).toEqual(sidecar)
  })
})
