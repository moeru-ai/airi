import { describe, expect, it, vi } from 'vitest'

import { DiscordAdapter } from './airi-adapter'

const mockChannelSend = vi.fn().mockResolvedValue(undefined)
const mockChannelsFetch = vi.fn()

const eventHandlers = new Map<string, (event: unknown) => Promise<void> | void>()

vi.mock('discord.js', () => ({
  Client: class {
    channels = { fetch: mockChannelsFetch }
    isReady = false
    on = vi.fn()
    once = vi.fn()
    login = vi.fn().mockResolvedValue(undefined)
    destroy = vi.fn().mockResolvedValue(undefined)
    user = { id: 'discord-bot', tag: 'discord-bot#0000' }
  },
  Events: {
    ClientReady: 'clientReady',
    MessageCreate: 'messageCreate',
  },
  GatewayIntentBits: {
    Guilds: 1 << 0,
    GuildVoiceStates: 1 << 1,
    GuildMessages: 1 << 2,
    MessageContent: 1 << 3,
    DirectMessages: 1 << 4,
  },
  Partials: {
    Channel: 1,
  },
}))

vi.mock('../bots/discord/commands', () => ({
  handlePing: vi.fn(),
  registerCommands: vi.fn().mockResolvedValue(undefined),
  VoiceManager: vi.fn(),
}))

vi.mock('@proj-airi/server-sdk', () => ({
  Client: class {
    onEvent = vi.fn((event: string, handler: (event: unknown) => Promise<void> | void) => {
      eventHandlers.set(event, handler)
    })

    send = vi.fn()

    constructor() {
      // no-op
    }
  },
}))

describe('airi-adapter output sanitization', () => {
  it('does not call channel.send when sanitized content is empty', async () => {
    mockChannelSend.mockClear()
    mockChannelsFetch.mockClear()
    eventHandlers.clear()

    mockChannelsFetch.mockResolvedValue({
      isTextBased: () => true,
      send: mockChannelSend,
    })

    void new DiscordAdapter({})
    const handler = eventHandlers.get('output:gen-ai:chat:message')

    expect(handler).toBeDefined()
    if (!handler)
      return

    await handler({
      data: {
        'message': { content: '<|ACT {"cognitive":"internal reasoning"}|>' },
        'gen-ai:chat': { input: { data: { discord: { channelId: 'channel-1' } } } },
      },
    })

    expect(mockChannelsFetch).toHaveBeenCalledWith('channel-1')
    expect(mockChannelSend).not.toHaveBeenCalled()
  })

  it('sends sanitized text after removing control tokens', async () => {
    mockChannelSend.mockClear()
    mockChannelsFetch.mockClear()
    eventHandlers.clear()

    mockChannelsFetch.mockResolvedValue({
      isTextBased: () => true,
      send: mockChannelSend,
    })

    void new DiscordAdapter({})
    const handler = eventHandlers.get('output:gen-ai:chat:message')

    expect(handler).toBeDefined()
    if (!handler)
      return

    await handler({
      data: {
        'message': { content: 'Before <|ACT {"emotion":"think"}|>after' },
        'gen-ai:chat': { input: { data: { discord: { channelId: 'channel-1' } } },
        },
      },
    })

    expect(mockChannelsFetch).toHaveBeenCalledWith('channel-1')
    expect(mockChannelSend).toHaveBeenCalledTimes(1)
    expect(mockChannelSend).toHaveBeenCalledWith('Before after')
  })
})
