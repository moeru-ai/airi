import { describe, expect, it } from 'vitest'

import {
  buildMessagePrefix,
  computeSessionId,
  normalizeDiscordMetadata,
} from '../src/utils/discord-context'

/**
 * @example
 * computeSessionId({ guildId: '1' }) // -> "discord-guild-1"
 */
describe('computeSessionId', () => {
  it('uses the guild id when available', () => {
    expect(computeSessionId({ guildId: '42' })).toBe('discord-guild-42')
  })

  it('falls back to the user id for DMs', () => {
    expect(
      computeSessionId({
        guildMember: { id: 'user-1', displayName: 'A', nickname: 'A' },
      }),
    ).toBe('discord-dm-user-1')
  })

  it('returns unknown when nothing usable is provided', () => {
    expect(computeSessionId(undefined)).toBe('discord-dm-unknown')
    expect(computeSessionId({})).toBe('discord-dm-unknown')
  })
})

/**
 * @example
 * buildMessagePrefix({ guildMember: { displayName: 'A' }, guildName: 'B' })
 * // -> "(From Discord user A on server 'B'): "
 */
describe('buildMessagePrefix', () => {
  it('formats guild messages with the display name', () => {
    const prefix = buildMessagePrefix({
      guildName: 'Friends',
      guildMember: { id: '1', displayName: 'Ayaka', nickname: 'Ayaka' },
    })

    expect(prefix).toBe('(From Discord user Ayaka on server \'Friends\'): ')
  })

  it('formats DMs with the display name', () => {
    const prefix = buildMessagePrefix({
      guildMember: { id: '1', displayName: 'Ayaka', nickname: 'Ayaka' },
    })

    expect(prefix).toBe('(From Discord user Ayaka in Direct Message): ')
  })

  it('falls back to anonymous phrasing when no member info is available', () => {
    expect(buildMessagePrefix(undefined))
      .toBe('(From Discord user in Direct Message): ')
  })
})

/**
 * @example
 * normalizeDiscordMetadata({ guildMember: { id: '1' } })
 * // -> { guildMember: { id: '1', displayName: '', nickname: '' } }
 */
describe('normalizeDiscordMetadata', () => {
  it('returns undefined when input is undefined', () => {
    expect(normalizeDiscordMetadata(undefined)).toBeUndefined()
  })

  it('keeps original fields and fills missing guildMember properties', () => {
    const result = normalizeDiscordMetadata({
      channelId: 'c1',
      guildId: 'g1',
      guildMember: { id: '', displayName: 'Ayaka', nickname: '' },
    })

    expect(result?.channelId).toBe('c1')
    expect(result?.guildId).toBe('g1')
    expect(result?.guildMember?.id).toBe('Ayaka')
    expect(result?.guildMember?.displayName).toBe('Ayaka')
    expect(result?.guildMember?.nickname).toBe('Ayaka')
  })
})
