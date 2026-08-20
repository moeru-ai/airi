import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DiscordAdapter } from './airi-adapter'

const mocks = vi.hoisted(() => {
  interface ConfigEvent {
    data: { config?: unknown }
  }
  interface ConnectionStatus {
    type: string
    data: {
      phase?: string
      reason?: string
    }
  }

  class FakeServerChannel {
    static instances: FakeServerChannel[] = []
    readonly handlers = new Map<string, (event: ConfigEvent) => Promise<void> | void>()
    readonly sent: ConnectionStatus[] = []

    constructor(_options: unknown) {
      FakeServerChannel.instances.push(this)
    }

    onEvent(type: string, handler: (event: ConfigEvent) => Promise<void> | void) {
      this.handlers.set(type, handler)
    }

    send(event: ConnectionStatus) {
      this.sent.push(event)
    }

    close = vi.fn()
  }

  class FakeDiscordClient {
    static instances: FakeDiscordClient[] = []
    readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    readonly isReady = vi.fn(() => false)
    readonly login = vi.fn(async () => undefined)
    readonly destroy = vi.fn(async () => undefined)
    readonly channels = { fetch: vi.fn() }

    constructor(_options: unknown) {
      FakeDiscordClient.instances.push(this)
    }

    on(type: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
      return this
    }

    once(type: string, listener: (...args: unknown[]) => void) {
      return this.on(type, listener)
    }

    emit(type: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(...args)
      }
    }
  }

  return {
    FakeServerChannel,
    FakeDiscordClient,
    reset() {
      FakeServerChannel.instances = []
      FakeDiscordClient.instances = []
    },
  }
})

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => ({
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      withError: () => ({ error: vi.fn() }),
    }),
  }),
}))

vi.mock('@proj-airi/server-sdk', () => ({
  Client: mocks.FakeServerChannel,
}))

vi.mock('@proj-airi/server-shared/types', () => ({
  ContextUpdateStrategy: { Replace: 'replace' },
}))

vi.mock('discord.js', () => ({
  Client: mocks.FakeDiscordClient,
  Events: {
    ClientReady: 'ready',
    Error: 'error',
    ShardDisconnect: 'disconnect',
    MessageCreate: 'message',
    InteractionCreate: 'interaction',
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildVoiceStates: 2,
    GuildMessages: 4,
    MessageContent: 8,
    DirectMessages: 16,
  },
  Partials: { Channel: 'channel' },
}))

vi.mock('../bots/discord/commands', () => ({
  handlePing: vi.fn(),
  registerCommands: vi.fn(),
  VoiceManager: class {},
}))

describe('discord adapter connection status', () => {
  beforeEach(() => {
    mocks.reset()
  })

  it('only reports ready after Discord emits ClientReady', async () => {
    const adapter = new DiscordAdapter({ discordToken: 'bot-token' })
    const channel = mocks.FakeServerChannel.instances[0]!
    const discord = mocks.FakeDiscordClient.instances[0]!
    const configure = channel.handlers.get('module:configure')!

    expect(adapter).toBeInstanceOf(DiscordAdapter)
    await configure({ data: { config: { enabled: true, token: 'bot-token' } } })

    expect(channel.sent).toContainEqual(expect.objectContaining({
      type: 'module:status',
      data: expect.objectContaining({ phase: 'preparing' }),
    }))
    expect(channel.sent).not.toContainEqual(expect.objectContaining({
      type: 'module:status',
      data: expect.objectContaining({ phase: 'ready' }),
    }))

    discord.emit('ready', { user: { id: 'bot-id', tag: 'AIRI#0001' } })

    expect(channel.sent).toContainEqual(expect.objectContaining({
      type: 'module:status',
      data: expect.objectContaining({ phase: 'ready' }),
    }))
  })

  it('reports a non-ready status when the integration is disabled', async () => {
    const adapter = new DiscordAdapter({})
    const channel = mocks.FakeServerChannel.instances[0]!
    const configure = channel.handlers.get('module:configure')!

    expect(adapter).toBeInstanceOf(DiscordAdapter)
    await configure({ data: { config: { enabled: false } } })

    expect(channel.sent).toContainEqual(expect.objectContaining({
      type: 'module:status',
      data: expect.objectContaining({ phase: 'configuration-needed' }),
    }))
  })

  it('cancels an in-progress connection when the integration is disabled', async () => {
    const adapter = new DiscordAdapter({})
    const channel = mocks.FakeServerChannel.instances[0]!
    const discord = mocks.FakeDiscordClient.instances[0]!
    const configure = channel.handlers.get('module:configure')!
    let resolveLogin: () => void
    discord.login.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      resolveLogin = () => resolve(undefined)
    }))

    const enable = configure({ data: { config: { enabled: true, token: 'bot-token' } } })
    await vi.waitFor(() => expect(discord.login).toHaveBeenCalledTimes(1))
    const disable = configure({ data: { config: { enabled: false } } })
    resolveLogin!()

    await Promise.all([enable, disable])

    expect(adapter).toBeInstanceOf(DiscordAdapter)
    expect(discord.destroy).toHaveBeenCalledTimes(1)
    expect(channel.sent).toContainEqual(expect.objectContaining({
      type: 'module:status',
      data: expect.objectContaining({ phase: 'configuration-needed' }),
    }))

    discord.emit('ready', { user: { id: 'bot-id', tag: 'AIRI#0001' } })

    expect(channel.sent).not.toContainEqual(expect.objectContaining({
      type: 'module:status',
      data: expect.objectContaining({ phase: 'ready' }),
    }))
  })
})
