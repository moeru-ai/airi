import type { Discord } from '@proj-airi/server-shared/types'

/**
 * Normalizes a Discord metadata object so that `guildMember` always has stable
 * `id`, `displayName`, and `nickname` fields.
 *
 * Use when:
 * - Forwarding Discord metadata along with `input:text` / `input:text:voice` events
 *   to the AIRI server.
 *
 * Expects:
 * - `discord` may be undefined, in which case this returns undefined.
 *
 * Returns:
 * - A copy of `discord` with guildMember fields coerced to strings.
 */
export function normalizeDiscordMetadata(discord?: Discord): Discord | undefined {
  if (!discord)
    return undefined

  if (!discord.guildMember)
    return discord

  const { guildMember } = discord

  return {
    ...discord,
    guildMember: {
      id: guildMember.id || guildMember.displayName || guildMember.nickname || '',
      nickname: guildMember.nickname || guildMember.displayName || '',
      displayName: guildMember.displayName || guildMember.nickname || '',
    },
  }
}

/**
 * Computes a deterministic session identifier for the AIRI memory layer so that
 * messages coming from the same guild (or DM/user) are grouped together.
 *
 * Use when:
 * - Building `overrides.sessionId` for Discord-sourced input events.
 *
 * Before:
 * - { guildId: "123", guildMember: { id: "456", ... } }
 *
 * After:
 * - "discord-guild-123"
 *
 * Before:
 * - { guildMember: { id: "456", ... } } // DM
 *
 * After:
 * - "discord-dm-456"
 */
export function computeSessionId(discord?: Discord): string {
  if (discord?.guildId) {
    return `discord-guild-${discord.guildId}`
  }
  return `discord-dm-${discord?.guildMember?.id || 'unknown'}`
}

/**
 * Builds the `messagePrefix` shown to the AI to frame the message context.
 *
 * Use when:
 * - Constructing `overrides.messagePrefix` on outbound `input:text` events.
 *
 * Before:
 * - { guildName: "Friends", guildMember: { displayName: "Ayaka" } }
 *
 * After:
 * - "(From Discord user Ayaka on server 'Friends'): "
 */
export function buildMessagePrefix(discord?: Discord): string {
  const displayName = discord?.guildMember?.displayName
  const serverName = discord?.guildName
  const contextPrefix = serverName
    ? `on server '${serverName}'`
    : 'in Direct Message'

  return displayName
    ? `(From Discord user ${displayName} ${contextPrefix}): `
    : `(From Discord user ${contextPrefix}): `
}
