import { describe, expect, it, vi } from 'vitest'

import { defineExtension, DisposableStore } from './index'

describe('defineExtension', () => {
  it('defines an extension with setup and module registration context', async () => {
    const setup = vi.fn(async () => {})
    const extension = defineExtension({
      id: 'airi-extension-test',
      version: '1.0.0',
      setup,
    })

    expect(extension.id).toBe('airi-extension-test')
    expect(extension.version).toBe('1.0.0')

    const subscriptions = new DisposableStore()
    await extension.setup({
      extension: {
        id: extension.id,
        version: extension.version,
        sessionId: 'session-1',
      },
      subscriptions,
      kits: {
        use: vi.fn(),
        tryUse: vi.fn(),
        watch: vi.fn(),
      },
      modules: {
        register: vi.fn(),
      },
    })

    expect(setup).toHaveBeenCalledTimes(1)
  })
})
