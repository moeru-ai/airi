import type { Config } from './composables/config'

import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { MinecraftBotRuntime } from './minecraft-bot-runtime'

class FakeMineflayer extends EventEmitter {
  bot = this
  stop = vi.fn(async () => undefined)
}

function createConfig(overrides: Partial<Config['bot']> = {}): Config['bot'] {
  return {
    host: 'mc.example.com',
    port: 25565,
    username: 'airi-bot',
    version: '1.21',
    auth: 'offline',
    ...overrides,
  }
}

describe('minecraftBotRuntime', () => {
  it('recreates the underlying bot when config changes', async () => {
    const firstBot = new FakeMineflayer()
    const secondBot = new FakeMineflayer()
    const createBot = vi
      .fn<(_: Config['bot']) => Promise<FakeMineflayer>>()
      .mockResolvedValueOnce(firstBot)
      .mockResolvedValueOnce(secondBot)

    const runtime = new MinecraftBotRuntime({
      createBot,
      initialConfig: createConfig(),
    })

    await runtime.initialize()
    await runtime.updateBotConfig(createConfig({
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    }))

    expect(createBot).toHaveBeenNthCalledWith(1, createConfig())
    expect(createBot).toHaveBeenNthCalledWith(2, createConfig({
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    }))
    expect(firstBot.stop).toHaveBeenCalledTimes(1)
  })

  it('forwards lifecycle events from the active bot only', async () => {
    const firstBot = new FakeMineflayer()
    const secondBot = new FakeMineflayer()
    const createBot = vi
      .fn<(_: Config['bot']) => Promise<FakeMineflayer>>()
      .mockResolvedValueOnce(firstBot)
      .mockResolvedValueOnce(secondBot)

    const runtime = new MinecraftBotRuntime({
      createBot,
      initialConfig: createConfig(),
    })

    const connected = vi.fn()
    const disconnected = vi.fn()
    const errored = vi.fn()

    runtime.on('bot:connected', connected)
    runtime.on('bot:disconnected', disconnected)
    runtime.on('bot:error', errored)

    await runtime.initialize()
    firstBot.emit('spawn')
    firstBot.emit('end', 'lost-connection')
    firstBot.emit('error', new Error('oops'))

    await runtime.updateBotConfig(createConfig({
      host: 'saved.example.com',
    }))

    firstBot.emit('spawn')
    secondBot.emit('spawn')

    expect(connected).toHaveBeenCalledTimes(2)
    expect(disconnected).toHaveBeenCalledWith('lost-connection')
    expect(errored).toHaveBeenCalledWith(expect.any(Error))
  })
})
