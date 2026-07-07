import { beforeEach, describe, expect, it } from 'vitest'

import { createPinia, setActivePinia } from 'pinia'

import { usePluginHostInspectorStore } from './plugin-host-debug'

describe('usePluginHostInspectorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('preserves sidecar status from inspection snapshots', async () => {
    const store = usePluginHostInspectorStore()
    const registry = { plugins: [], root: '/var/lib/airi/plugins' }
    const sidecar = {
      endpoint: 'http://127.0.0.1:49152',
      executablePath: '/opt/airi/plugin-host',
      lastError: undefined,
      pid: 42,
      state: 'ready' as const,
      updatedAt: 123,
    }

    store.setBridge({
      inspect: () =>
        Promise.resolve({
          capabilities: [],
          kits: [],
          modules: [],
          refreshedAt: 456,
          registry,
          sessions: [],
          sidecar,
        }),
      list: () => Promise.resolve(registry),
      load: () => Promise.resolve(registry),
      loadEnabled: () => Promise.resolve(registry),
      setAutoReload: () => Promise.resolve(registry),
      setEnabled: () => Promise.resolve(registry),
      unload: () => Promise.resolve(registry),
    })

    await store.refreshInspection()

    expect(store.sidecar).toEqual(sidecar)
  })
})
