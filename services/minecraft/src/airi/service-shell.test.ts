import type { MinecraftEditableConfig, MinecraftRuntimeConfigSnapshot } from '../composables/runtime-config'

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MinecraftServiceShell } from './service-shell'

class FakeBot extends EventEmitter {
  updateBotConfig = vi.fn(async () => undefined)
  stop = vi.fn(async () => undefined)
}

function createSnapshot(overrides: Partial<MinecraftRuntimeConfigSnapshot> = {}): MinecraftRuntimeConfigSnapshot {
  return {
    editableConfig: {
      enabled: true,
      host: 'mc.example.com',
      port: 25565,
      username: 'airi-bot',
    },
    effectiveBotConfig: {
      host: 'mc.example.com',
      port: 25565,
      username: 'airi-bot',
      version: '1.21',
      auth: 'offline',
      password: '',
    },
    ...overrides,
  }
}

describe('minecraftServiceShell', () => {
  const sentEvents: any[] = []
  const configureHandlers = new Set<(event: { data: { config?: unknown } }) => void | Promise<void>>()

  const client = {
    onEvent: vi.fn((type: string, handler: (event: { data: { config?: unknown } }) => void | Promise<void>) => {
      if (type === 'module:configure')
        configureHandlers.add(handler)
    }),
    send: vi.fn((event: unknown) => {
      sentEvents.push(event)
    }),
  }

  beforeEach(() => {
    sentEvents.length = 0
    configureHandlers.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not emit automated context updates during bot lifecycle changes', async () => {
    const bot = new FakeBot()
    const configManager = {
      load: vi.fn(() => createSnapshot()),
      save: vi.fn(),
    }

    const shell = new MinecraftServiceShell({
      airiClient: client as any,
      configManager: configManager as any,
      createBot: vi.fn(async () => bot as any),
      heartbeatMs: 5_000,
      now: () => 123,
    })

    await shell.initialize()
    expect(sentEvents).toHaveLength(0)

    bot.emit('bot:connected')
    bot.emit('bot:error', new Error('boot failed'))
    bot.emit('bot:disconnected', 'closed')

    vi.advanceTimersByTime(5_000)
    expect(sentEvents).toHaveLength(0)
  })

  it('persists and hot-applies valid config updates to the active bot', async () => {
    const bot = new FakeBot()
    const savedSnapshot = createSnapshot({
      editableConfig: {
        enabled: true,
        host: 'saved.example.com',
        port: 24444,
        username: 'saved-bot',
      },
      effectiveBotConfig: {
        host: 'saved.example.com',
        port: 24444,
        username: 'saved-bot',
        version: '1.21',
        auth: 'offline',
        password: '',
      },
    })

    const configManager = {
      load: vi.fn(() => createSnapshot()),
      save: vi.fn((_config: MinecraftEditableConfig) => savedSnapshot),
    }

    const shell = new MinecraftServiceShell({
      airiClient: client as any,
      configManager: configManager as any,
      createBot: vi.fn(async () => bot as any),
      heartbeatMs: 5_000,
      now: () => 456,
    })

    await shell.initialize()

    for (const handler of configureHandlers) {
      await handler({
        data: {
          config: {
            enabled: true,
            host: 'saved.example.com',
            port: 24444,
            username: 'saved-bot',
          },
        },
      })
    }

    expect(configManager.save).toHaveBeenCalledWith({
      enabled: true,
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    })
    expect(bot.updateBotConfig).toHaveBeenCalledWith(savedSnapshot.effectiveBotConfig)
    expect(sentEvents).toHaveLength(0)
  })

  it('reports invalid config updates without dropping the healthy bot', async () => {
    const bot = new FakeBot()
    const configManager = {
      load: vi.fn(() => createSnapshot()),
      save: vi.fn(() => {
        throw new Error('invalid username')
      }),
    }

    const shell = new MinecraftServiceShell({
      airiClient: client as any,
      configManager: configManager as any,
      createBot: vi.fn(async () => bot as any),
      heartbeatMs: 5_000,
      now: () => 789,
    })

    await shell.initialize()
    bot.emit('bot:connected')

    for (const handler of configureHandlers) {
      await handler({
        data: {
          config: {
            enabled: true,
            host: 'mc.example.com',
            port: 25565,
            username: '',
          },
        },
      })
    }

    expect(bot.updateBotConfig).not.toHaveBeenCalled()
    expect(bot.stop).not.toHaveBeenCalled()
    expect(sentEvents).toHaveLength(0)
  })
})
