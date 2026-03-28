import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it, vi } from 'vitest'

import { AiriBridge } from './airi-bridge'

describe('airiBridge', () => {
  it('sends spark:notify events to the character destination', () => {
    const client = {
      send: vi.fn(),
      onEvent: vi.fn(),
      offEvent: vi.fn(),
    }

    const eventBus = {
      emit: vi.fn(),
    }

    const bridge = new AiriBridge(client as any, eventBus as any)

    bridge.sendNotify('Need AIRI help', 'Please respond', 'immediate')

    expect(client.send).toHaveBeenCalledTimes(1)
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'spark:notify',
      data: expect.objectContaining({
        kind: 'ping',
        urgency: 'immediate',
        headline: 'Need AIRI help',
        note: 'Please respond',
        destinations: ['proj-airi:stage-*'],
      }),
    }))
  })

  it('sends structured context updates with explicit strategy and destinations', () => {
    const client = {
      send: vi.fn(),
      onEvent: vi.fn(),
      offEvent: vi.fn(),
    }

    const eventBus = {
      emit: vi.fn(),
    }

    const bridge = new AiriBridge(client as any, eventBus as any)

    bridge.sendContextUpdate({
      contextId: 'minecraft:status',
      lane: 'minecraft:status',
      text: 'Bot online: AIRI',
      hints: ['status', 'AIRI'],
      strategy: ContextUpdateStrategy.ReplaceSelf,
      destinations: ['instance:stage-web-1'],
    })

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'context:update',
      data: expect.objectContaining({
        contextId: 'minecraft:status',
        lane: 'minecraft:status',
        text: 'Bot online: AIRI',
        hints: ['status', 'AIRI'],
        strategy: ContextUpdateStrategy.ReplaceSelf,
        destinations: ['instance:stage-web-1'],
      }),
    }))
  })

  it('notifies module announced listeners', () => {
    const handlers = new Map<string, (event: { data: unknown }) => void>()
    const client = {
      send: vi.fn(),
      onEvent: vi.fn((type: string, handler: (event: { data: unknown }) => void) => {
        handlers.set(type, handler)
      }),
      offEvent: vi.fn(),
    }

    const eventBus = {
      emit: vi.fn(),
    }

    const bridge = new AiriBridge(client as any, eventBus as any)
    const listener = vi.fn()
    bridge.onModuleAnnounced(listener)
    bridge.init()

    handlers.get('module:announced')?.({
      data: {
        name: 'stage-web',
        identity: {
          plugin: { id: 'stage-web' },
          id: 'stage-web-1',
        },
      },
    })

    expect(listener).toHaveBeenCalledWith({
      name: 'stage-web',
      identity: {
        plugin: { id: 'stage-web' },
        id: 'stage-web-1',
      },
    })
  })
})
