import { describe, expect, it, vi } from 'vitest'

import { createBuiltInExtensionKitRuntime } from './index'

describe('createBuiltInExtensionKitRuntime', () => {
  it('exposes one declaration for each built-in Host Kit', () => {
    const runtime = createBuiltInExtensionKitRuntime({
      widgetsManager: {
        openWindow: vi.fn(),
        pushWidget: vi.fn(),
        updateWidget: vi.fn(),
        removeWidget: vi.fn(),
        getWidgetSnapshot: vi.fn(),
        requestWidgetIframe: vi.fn(),
      },
    })

    expect(runtime.hostProvidedKits).toEqual([
      { id: 'kit.gamelet', version: '1.0.0' },
      { id: 'kit.tool', version: '1.0.0' },
      { id: 'kit.widget', version: '1.0.0' },
    ])
    runtime.dispose()
  })
})
