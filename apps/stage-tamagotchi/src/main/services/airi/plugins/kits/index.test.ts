import { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import { describe, expect, it, vi } from 'vitest'

import { createBuiltInExtensionKits } from './index'

function createWidgetsManagerStub() {
  return {
    openWindow: vi.fn(),
    pushWidget: vi.fn(),
    updateWidget: vi.fn(),
    removeWidget: vi.fn(),
    getWidgetSnapshot: vi.fn(),
    requestWidgetIframe: vi.fn(),
  }
}

describe('createBuiltInExtensionKits', () => {
  it('exposes one declaration for each built-in Host Kit', () => {
    const kits = createBuiltInExtensionKits({
      host: new ExtensionHost(),
      widgetsManager: createWidgetsManagerStub(),
    })

    expect(kits.hostProvidedKits).toEqual([
      { id: 'kit.gamelet', version: '1.0.0' },
      { id: 'kit.tool', version: '1.0.0' },
      { id: 'kit.widget', version: '1.0.0' },
    ])
    kits.dispose()
  })

  it('owns built-in Host source leases until disposal', () => {
    const host = new ExtensionHost()
    const kits = createBuiltInExtensionKits({
      host,
      widgetsManager: createWidgetsManagerStub(),
    })

    expect(host.listKitProviders().map(provider => provider.id)).toEqual([
      'kit.gamelet',
      'kit.tool',
      'kit.widget',
    ])

    kits.dispose()

    expect(host.listKitProviders()).toEqual([])
  })

  it('registers only on its own Host', () => {
    // ROOT CAUSE:
    //
    // The runtime used a non-empty lease array as its complete installation state.
    // It did not record which Host owned the installed sources.
    // Each instance now registers on the one Host that its injeca unit depends on.
    const firstHost = new ExtensionHost()
    const secondHost = new ExtensionHost()
    const kits = createBuiltInExtensionKits({
      host: firstHost,
      widgetsManager: createWidgetsManagerStub(),
    })

    expect(firstHost.listKitProviders()).toHaveLength(3)
    expect(secondHost.listKitProviders()).toEqual([])
    kits.dispose()
  })

  it('gives a new instance new Kit runtimes after disposal', () => {
    // ROOT CAUSE:
    //
    // Disposal emptied the lease array and destroyed the shared Kit runtimes.
    // The empty array then made the runtime appear ready for installation again.
    // A disposed instance now never registers again. A restart of the injeca unit builds new runtimes.
    const host = new ExtensionHost()
    const widgetsManager = createWidgetsManagerStub()
    const disposedKits = createBuiltInExtensionKits({ host, widgetsManager })

    disposedKits.dispose()
    expect(host.listKitProviders()).toEqual([])

    const kits = createBuiltInExtensionKits({ host, widgetsManager })
    expect(kits.tools).not.toBe(disposedKits.tools)
    expect(host.listKitProviders()).toHaveLength(3)
    kits.dispose()
  })

  it('rolls back leases when built-in Host Kit installation fails', () => {
    const host = new ExtensionHost()
    const conflictLease = host.registerKit({
      kitId: 'kit.gamelet',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [],
    })

    expect(() => createBuiltInExtensionKits({
      host,
      widgetsManager: createWidgetsManagerStub(),
    })).toThrow('provider-slot-conflict')
    expect(host.listKitProviders().map(provider => provider.id)).toEqual(['kit.gamelet'])

    conflictLease.dispose()
    const kits = createBuiltInExtensionKits({
      host,
      widgetsManager: createWidgetsManagerStub(),
    })
    expect(host.listKitProviders().map(provider => provider.id)).toEqual([
      'kit.gamelet',
      'kit.tool',
      'kit.widget',
    ])

    kits.dispose()
    expect(host.listKitProviders()).toEqual([])
  })
})
