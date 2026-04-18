import type { AiriChannel, CompanionChatInput } from '../src/airi/channel'

import { describe, expect, it, vi } from 'vitest'

import { createTextBridge } from '../src/discord/text-bridge'

interface FakeMessage {
  content: string
  author: { bot: boolean, id: string, username: string, tag: string }
  channelId: string
  guildId?: string
  guild?: { name: string } | null
  member?: { displayName?: string, nickname?: string } | null
  mentions: { users: Map<string, unknown> }
}

function makeAiriChannel(): AiriChannel & { sent: CompanionChatInput[] } {
  const sent: CompanionChatInput[] = []
  return {
    sent,
    close: vi.fn(),
    onConfigure: vi.fn(() => () => {}),
    onOutputMessage: vi.fn(() => () => {}),
    sendChatInput: (input: CompanionChatInput) => {
      sent.push(input)
    },
  }
}

function makeMessage(overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    content: overrides.content ?? 'hello',
    author: overrides.author ?? {
      bot: false,
      id: 'user-1',
      username: 'Ayaka',
      tag: 'Ayaka#0001',
    },
    channelId: overrides.channelId ?? 'channel-1',
    guildId: overrides.guildId,
    guild: overrides.guild ?? (overrides.guildId ? { name: 'Friends' } : null),
    member: overrides.member ?? null,
    mentions: overrides.mentions ?? { users: new Map() },
  }
}

/**
 * @example
 * createTextBridge({ ... }).handleMessage(msg) // -> true
 */
describe('createTextBridge', () => {
  it('ignores bot-authored messages', () => {
    const airi = makeAiriChannel()
    const bridge = createTextBridge({
      airi,
      getAttachedTextChannelId: () => undefined,
      getExtraChannelIds: () => [],
      isMentionOnly: () => true,
      getSelfUserId: () => 'self',
    })

    const forwarded = bridge.handleMessage(makeMessage({
      author: { bot: true, id: 'u', username: 'b', tag: 'b#0' },
    }) as never)

    expect(forwarded).toBe(false)
    expect(airi.sent).toHaveLength(0)
  })

  it('forwards DMs even when mention-only is enabled', () => {
    const airi = makeAiriChannel()
    const bridge = createTextBridge({
      airi,
      getAttachedTextChannelId: () => undefined,
      getExtraChannelIds: () => [],
      isMentionOnly: () => true,
      getSelfUserId: () => 'self',
    })

    const forwarded = bridge.handleMessage(makeMessage({
      content: 'こんにちは',
      guildId: undefined,
      guild: null,
    }) as never)

    expect(forwarded).toBe(true)
    expect(airi.sent[0]).toMatchObject({ kind: 'text', text: 'こんにちは' })
  })

  it('does not forward guild messages without mention when mention-only is true', () => {
    const airi = makeAiriChannel()
    const bridge = createTextBridge({
      airi,
      getAttachedTextChannelId: () => 'voice-1',
      getExtraChannelIds: () => [],
      isMentionOnly: () => true,
      getSelfUserId: () => 'self',
    })

    const forwarded = bridge.handleMessage(makeMessage({
      content: 'hi',
      channelId: 'voice-1',
      guildId: 'g1',
    }) as never)

    expect(forwarded).toBe(false)
    expect(airi.sent).toHaveLength(0)
  })

  it('forwards voice-attached channel messages when mention-only is disabled', () => {
    const airi = makeAiriChannel()
    const bridge = createTextBridge({
      airi,
      getAttachedTextChannelId: () => 'voice-1',
      getExtraChannelIds: () => [],
      isMentionOnly: () => false,
      getSelfUserId: () => 'self',
    })

    const forwarded = bridge.handleMessage(makeMessage({
      content: 'general chatter',
      channelId: 'voice-1',
      guildId: 'g1',
    }) as never)

    expect(forwarded).toBe(true)
    expect(airi.sent[0].text).toBe('general chatter')
  })

  it('strips bot mentions before forwarding', () => {
    const airi = makeAiriChannel()
    const selfId = '1234567890'
    const bridge = createTextBridge({
      airi,
      getAttachedTextChannelId: () => 'voice-1',
      getExtraChannelIds: () => [],
      isMentionOnly: () => true,
      getSelfUserId: () => selfId,
    })

    const raw = `<@${selfId}> hello there`
    const forwarded = bridge.handleMessage(makeMessage({
      content: raw,
      channelId: 'voice-1',
      guildId: 'g1',
      mentions: { users: new Map([[selfId, {}]]) },
    }) as never)

    expect(forwarded).toBe(true)
    expect(airi.sent[0].text).toBe('hello there')
    expect(airi.sent[0].textRaw).toBe(raw)
  })

  it('forwards messages from configured extra channels', () => {
    const airi = makeAiriChannel()
    const bridge = createTextBridge({
      airi,
      getAttachedTextChannelId: () => undefined,
      getExtraChannelIds: () => ['extra-1'],
      isMentionOnly: () => false,
      getSelfUserId: () => 'self',
    })

    const forwarded = bridge.handleMessage(makeMessage({
      content: 'topic chat',
      channelId: 'extra-1',
      guildId: 'g1',
    }) as never)

    expect(forwarded).toBe(true)
    expect(airi.sent[0].text).toBe('topic chat')
  })
})
