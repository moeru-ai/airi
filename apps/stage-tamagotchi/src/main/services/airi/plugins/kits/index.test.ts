import { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import { describe, expect, it, vi } from 'vitest'

import { createBuiltInExtensionKitRuntime } from './index'

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

describe('createBuiltInExtensionKitRuntime', () => {
  it('exposes one declaration for each built-in Host Kit', () => {
    const runtime = createBuiltInExtensionKitRuntime({
      widgetsManager: createWidgetsManagerStub(),
    })

    expect(runtime.hostProvidedKits).toEqual([
      { id: 'kit.gamelet', version: '1.0.0' },
      { id: 'kit.tool', version: '1.0.0' },
      { id: 'kit.widget', version: '1.0.0' },
    ])
    runtime.dispose()
  })

  it('owns built-in Host source leases across duplicate installation and disposal', () => {
    const runtime = createBuiltInExtensionKitRuntime({
      widgetsManager: createWidgetsManagerStub(),
    })
    const host = new ExtensionHost()

    runtime.registerHostKits(host)
    runtime.registerHostKits(host)

    expect(host.listKitProviders().map(provider => provider.id)).toEqual([
      'kit.gamelet',
      'kit.tool',
      'kit.widget',
    ])

    runtime.dispose()

    expect(host.listKitProviders()).toEqual([])
  })

  it('rejects installation on another Host', () => {
    // ROOT CAUSE:
    //
    // The runtime used a non-empty lease array as its complete installation state.
    // It did not record which Host owned the installed sources.
    // The explicit installed state now records the Host and rejects another Host.
    const runtime = createBuiltInExtensionKitRuntime({
      widgetsManager: createWidgetsManagerStub(),
    })
    const firstHost = new ExtensionHost()
    const secondHost = new ExtensionHost()

    runtime.registerHostKits(firstHost)

    expect(() => runtime.registerHostKits(secondHost)).toThrow('another Extension Host')
    expect(secondHost.listKitProviders()).toEqual([])
    runtime.dispose()
  })

  it('rejects installation after disposal', () => {
    // ROOT CAUSE:
    //
    // Disposal emptied the lease array and destroyed the shared Kit runtimes.
    // The empty array then made the runtime appear ready for installation again.
    // The explicit disposed state now prevents a later installation.
    const runtime = createBuiltInExtensionKitRuntime({
      widgetsManager: createWidgetsManagerStub(),
    })
    const host = new ExtensionHost()

    runtime.registerHostKits(host)
    runtime.dispose()

    expect(() => runtime.registerHostKits(host)).toThrow('disposed')
    expect(host.listKitProviders()).toEqual([])
  })

  it('rolls back leases when built-in Host Kit installation fails', () => {
    const runtime = createBuiltInExtensionKitRuntime({
      widgetsManager: createWidgetsManagerStub(),
    })
    const host = new ExtensionHost()
    const conflictLease = host.registerKit({
      kitId: 'kit.gamelet',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [],
    })

    expect(() => runtime.registerHostKits(host)).toThrow('provider-slot-conflict')
    expect(host.listKitProviders().map(provider => provider.id)).toEqual(['kit.gamelet'])

    conflictLease.dispose()
    runtime.registerHostKits(host)
    expect(host.listKitProviders().map(provider => provider.id)).toEqual([
      'kit.gamelet',
      'kit.tool',
      'kit.widget',
    ])

    runtime.dispose()
    expect(host.listKitProviders()).toEqual([])
  })
})
