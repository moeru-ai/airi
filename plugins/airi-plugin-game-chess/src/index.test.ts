import type { ContextInit } from '@proj-airi/plugin-sdk'

import { describe, expect, it, vi } from 'vitest'

import { setupModules } from './index'

/**
 * Builds a host-API double exposing the gamelet kit, binding registry and tool
 * registry that {@link setupModules} drives.
 */
function createApisDouble() {
  const announce = vi.fn()
  const register = vi.fn()
  const open = vi.fn()
  const apis = {
    kits: {
      list: async () => [{ kitId: 'kit.gamelet', version: '1.0.0', runtimes: ['electron'], capabilities: [] }],
      getCapabilities: async () => [],
    },
    bindings: {
      list: async () => [],
      announce,
      update: vi.fn(),
      activate: vi.fn(),
      withdraw: vi.fn(),
    },
    tools: { register },
    gamelets: {
      open,
      configure: vi.fn(),
      request: vi.fn(async () => ({})),
      close: vi.fn(),
      isOpen: vi.fn(() => true),
    },
    providers: { listProviders: async () => [] },
  }
  return { apis, announce, register, open }
}

/**
 * @example
 * await setupModules({ apis } as unknown as ContextInit)
 */
describe('setupModules', () => {
  /**
   * @example
   * expect(announce).toHaveBeenCalledWith(expect.objectContaining({ moduleId: 'chess' }))
   */
  it('registers the chess gamelet under the kit.gamelet kit', async () => {
    const { apis, announce } = createApisDouble()

    await setupModules({ apis } as unknown as ContextInit)

    expect(announce).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'chess',
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
    }))
  })

  /**
   * @example
   * expect(register).toHaveBeenCalledWith(expect.objectContaining({ tool: { id: 'explain_move' } }))
   */
  it('registers the analyze_position and explain_move tools', async () => {
    const { apis, register } = createApisDouble()

    await setupModules({ apis } as unknown as ContextInit)

    expect(register).toHaveBeenCalledTimes(2)
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      tool: expect.objectContaining({ id: 'analyze_position' }),
    }))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      tool: expect.objectContaining({ id: 'explain_move' }),
    }))
  })

  /**
   * @example
   * expect(open).toHaveBeenCalledWith('chess')
   */
  it('opens the chess gamelet once it is registered', async () => {
    const { apis, open } = createApisDouble()

    await setupModules({ apis } as unknown as ContextInit)

    expect(open).toHaveBeenCalledWith('chess')
  })
})
