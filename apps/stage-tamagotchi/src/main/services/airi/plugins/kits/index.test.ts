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
  it('owns built-in Host Kit registrations across duplicate installation and disposal', async () => {
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

    await runtime.dispose()

    expect(host.listKitProviders()).toEqual([])
  })

  it('rejects installation on another Host', async () => {
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
    await runtime.dispose()
  })

  it('rejects installation after disposal', async () => {
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
    await runtime.dispose()

    expect(() => runtime.registerHostKits(host)).toThrow('disposed')
    expect(host.listKitProviders()).toEqual([])
  })

  it('rolls back registrations when built-in Host Kit installation fails', async () => {
    const runtime = createBuiltInExtensionKitRuntime({
      widgetsManager: createWidgetsManagerStub(),
    })
    const host = new ExtensionHost()
    const conflict = host.provideKit({ descriptor: {
      kitId: 'kit.gamelet',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [],
    } })

    expect(() => runtime.registerHostKits(host)).toThrow('provider-slot-conflict')
    await vi.waitFor(() => expect(host.listKitProviders().map(provider => provider.id)).toEqual(['kit.gamelet']))

    await conflict.withdraw()
    runtime.registerHostKits(host)
    expect(host.listKitProviders().map(provider => provider.id)).toEqual([
      'kit.gamelet',
      'kit.tool',
      'kit.widget',
    ])

    await runtime.dispose()
    expect(host.listKitProviders()).toEqual([])
  })
})
