import type { Client } from '@proj-airi/server-sdk'

import type { EventBus } from '../cognitive/event-bus'

import { describe, expect, it, vi } from 'vitest'

import { AiriBridge } from './airi-bridge'

interface TestCommandEvent {
  data: {
    commandId: string
    guidance?: {
      options?: Array<{ label: string, steps: string[] }>
    }
    intent: 'action' | 'context' | 'pause' | 'plan' | 'proposal' | 'reroute' | 'resume'
    interrupt: 'force' | 'soft' | false
    priority: 'critical' | 'high' | 'low' | 'normal'
  }
}

function createBridgeHarness(options: { commandAvailable?: boolean } = {}) {
  const handlers = new Map<string, (event: TestCommandEvent) => void>()
  const client = {
    offEvent: vi.fn(),
    onEvent: vi.fn((type: string, handler: (event: TestCommandEvent) => void) => {
      handlers.set(type, handler)
    }),
    send: vi.fn(),
  }
  const eventBus = {
    emit: vi.fn(),
  }
  // NOTICE:
  // The bridge consumes only send/onEvent/offEvent and emit, while the production classes own many unrelated fields.
  // The root cause is that AiriBridge accepts concrete Client and EventBus classes instead of narrow structural ports.
  // Source/context: integrations/minecraft/src/airi/airi-bridge.ts constructor.
  // Remove this cast when the bridge constructor accepts dedicated client and event-bus interfaces.
  const bridge = new AiriBridge(client as unknown as Client, eventBus as unknown as EventBus)
  bridge.init()
  bridge.setCommandAvailable(options.commandAvailable ?? true)

  return { bridge, client, eventBus, handlers }
}

/**
 * @example
 * bridge.setCommandAvailable(true) lets a generic `spark:command` wake the Minecraft brain.
 */
describe('airiBridge spark command routing', () => {
  /**
   * @example
   * expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'signal:airi_command' }))
   */
  it('routes spark commands as AIRI commands instead of chat messages', () => {
    const { bridge, eventBus, handlers } = createBridgeHarness()
    const commandHandler = handlers.get('spark:command')

    expect(commandHandler).toBeDefined()

    commandHandler?.({
      data: {
        commandId: 'spark-1',
        guidance: {
          options: [
            {
              label: 'collect wood',
              steps: ['find a tree', 'chop it'],
            },
          ],
        },
        intent: 'action',
        interrupt: false,
        priority: 'normal',
      },
    })

    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        description: 'Directive from AIRI: "collect wood"',
        metadata: expect.objectContaining({
          message: 'collect wood',
          sparkCommandId: 'spark-1',
          sparkIntent: 'action',
        }),
        sourceId: 'airi',
        type: 'airi_command',
      }),
      type: 'signal:airi_command',
    }))
    expect(eventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'signal:chat_message',
    }))

    bridge.destroy()
  })

  /**
   * @example
   * expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'dropped' }) }))
   */
  it('drops relayed commands while no Minecraft bot runtime is active', () => {
    const { bridge, client, eventBus, handlers } = createBridgeHarness({ commandAvailable: false })
    const commandHandler = handlers.get('spark:command')

    commandHandler?.({
      data: {
        commandId: 'spark-offline',
        guidance: {
          options: [
            {
              label: 'collect wood',
              steps: ['find a tree', 'chop it'],
            },
          ],
        },
        intent: 'action',
        interrupt: false,
        priority: 'normal',
      },
    })

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventId: 'spark-offline',
        note: 'Minecraft bot is offline',
        state: 'dropped',
      }),
      type: 'spark:emit',
    }))
    expect(eventBus.emit).not.toHaveBeenCalled()

    bridge.destroy()
  })
})
