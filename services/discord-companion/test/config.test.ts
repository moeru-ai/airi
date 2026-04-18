import { describe, expect, it } from 'vitest'

import {
  isCompanionRemoteConfig,
  loadCompanionConfigFromEnv,
  parseAutoJoin,
  parseChannelIds,
} from '../src/config'

/**
 * @example
 * parseAutoJoin('guild:channel') // -> { guildId: 'guild', channelId: 'channel' }
 */
describe('parseAutoJoin', () => {
  it('returns undefined for empty input', () => {
    expect(parseAutoJoin('')).toBeUndefined()
    expect(parseAutoJoin('   ')).toBeUndefined()
  })

  it('returns undefined for malformed input', () => {
    expect(parseAutoJoin('guildonly')).toBeUndefined()
    expect(parseAutoJoin('a:b:c')).toBeUndefined()
  })

  it('parses a valid guild:channel string', () => {
    expect(parseAutoJoin('g1:c1')).toEqual({ guildId: 'g1', channelId: 'c1' })
  })
})

/**
 * @example
 * parseChannelIds('1,2,1') // -> ['1', '2']
 */
describe('parseChannelIds', () => {
  it('deduplicates and preserves order', () => {
    expect(parseChannelIds('1,2, 2,3,1')).toEqual(['1', '2', '3'])
  })

  it('returns an empty array for empty input', () => {
    expect(parseChannelIds('')).toEqual([])
  })
})

/**
 * @example
 * isCompanionRemoteConfig({ enabled: true }) // -> true
 */
describe('isCompanionRemoteConfig', () => {
  it('accepts valid payloads', () => {
    expect(isCompanionRemoteConfig({ enabled: true })).toBe(true)
    expect(isCompanionRemoteConfig({ enabled: false, token: 'x' })).toBe(true)
    expect(isCompanionRemoteConfig({
      textChannelIds: ['1'],
      mentionOnly: false,
      autoJoin: { guildId: 'g', channelId: 'c' },
    })).toBe(true)
    expect(isCompanionRemoteConfig({ autoJoin: null })).toBe(true)
  })

  it('rejects invalid shapes', () => {
    expect(isCompanionRemoteConfig({ enabled: 'yes' })).toBe(false)
    expect(isCompanionRemoteConfig({ textChannelIds: 'foo' })).toBe(false)
    expect(isCompanionRemoteConfig({ autoJoin: { guildId: 'g' } })).toBe(false)
  })
})

/**
 * @example
 * loadCompanionConfigFromEnv({ DISCORD_COMPANION_TOKEN: 't' }).discordToken // 't'
 */
describe('loadCompanionConfigFromEnv', () => {
  it('applies defaults when no env vars are provided', () => {
    const config = loadCompanionConfigFromEnv({})

    expect(config.discordToken).toBe('')
    expect(config.airiUrl).toBe('ws://localhost:6121/ws')
    expect(config.airiToken).toBe('abcd')
    expect(config.textListen.mentionOnly).toBe(true)
    expect(config.textListen.extraChannelIds).toEqual([])
    expect(config.autoJoin).toBeUndefined()
    expect(config.stt.model).toBe('whisper-1')
  })

  it('reads DISCORD_TOKEN as a fallback for the companion token', () => {
    const config = loadCompanionConfigFromEnv({ DISCORD_TOKEN: 'legacy-token' })
    expect(config.discordToken).toBe('legacy-token')
  })

  it('parses mention-only flag and channel list', () => {
    const config = loadCompanionConfigFromEnv({
      DISCORD_COMPANION_TEXT_MENTION_ONLY: 'false',
      DISCORD_COMPANION_TEXT_CHANNEL_IDS: '1, 2, 3',
      DISCORD_COMPANION_AUTO_JOIN: 'g:c',
    })

    expect(config.textListen.mentionOnly).toBe(false)
    expect(config.textListen.extraChannelIds).toEqual(['1', '2', '3'])
    expect(config.autoJoin).toEqual({ guildId: 'g', channelId: 'c' })
  })
})
