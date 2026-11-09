import { describe, expect, it, vi } from 'vitest'

import { TamagotchiToolRegistry } from './registry'

describe('tamagotchiToolRegistry', () => {
  it('stores, invokes, and removes module-scoped Tamagotchi tools', async () => {
    const registry = new TamagotchiToolRegistry()
    const execute = vi.fn(async () => ({ ok: true }))

    registry.register({
      ownerSessionId: 'session-1',
      ownerExtensionId: 'airi-extension-chess',
      ownerModuleId: 'chess',
      tool: {
        id: 'play_chess',
        title: 'Play Chess',
        description: 'Open chess.',
        activation: {
          keywords: ['chess'],
          patterns: ['chess'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute,
    })
    registry.registerToolsetPrompt({
      ownerSessionId: 'session-1',
      ownerExtensionId: 'airi-extension-chess',
      ownerModuleId: 'chess',
      toolset: {
        id: 'chess-tools',
        prompt: {
          id: 'airi-plugin-game-chess.prompt',
          content: 'Prefer legal chess moves.',
        },
      },
    })

    await expect(registry.listAvailableDescriptors()).resolves.toEqual([{
      id: 'play_chess',
      title: 'Play Chess',
      description: 'Open chess.',
      activation: {
        keywords: ['chess'],
        patterns: ['chess'],
      },
    }])
    await expect(registry.listSerializedXsaiTools()).resolves.toEqual({
      prompts: [{
        ownerExtensionId: 'airi-extension-chess',
        id: 'chess-tools',
        prompt: {
          id: 'airi-plugin-game-chess.prompt',
          content: 'Prefer legal chess moves.',
        },
      }],
      tools: [{
        ownerExtensionId: 'airi-extension-chess',
        name: 'play_chess',
        description: 'Open chess.',
        parameters: {
          type: 'object',
          properties: {},
        },
      }],
    })
    await expect(registry.invoke('airi-extension-chess', 'play_chess', { move: 'e4' })).resolves.toEqual({ ok: true })
    expect(execute).toHaveBeenCalledWith({ move: 'e4' })

    registry.unregisterOwnerScope('session-1', 'chess')

    await expect(registry.listSerializedXsaiTools()).resolves.toEqual({
      prompts: [],
      tools: [],
    })
    await expect(registry.invoke('airi-extension-chess', 'play_chess', {})).rejects.toThrow(
      'Tamagotchi extension tool not found: airi-extension-chess:play_chess',
    )
  })
})
