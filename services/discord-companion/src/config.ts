import { env } from 'node:process'

import * as v from 'valibot'

/**
 * Options controlling which Discord channels the companion service listens to
 * for text messages (in addition to the voice channel attached text chat).
 *
 * Use when:
 * - Configuring the companion to be active on multiple text channels without
 *   requiring a voice connection.
 */
export interface CompanionTextListenOptions {
  /**
   * Extra text channel IDs to forward messages from, beyond the text chat
   * attached to the currently joined voice channel.
   *
   * @default []
   */
  extraChannelIds: string[]
  /**
   * When `true`, the companion forwards a text message only when the bot is
   * mentioned or the message is a DM. When `false`, every non-bot message in
   * a listened channel is forwarded.
   *
   * @default true
   */
  mentionOnly: boolean
}

/**
 * Optional auto-join target applied once on Discord `ClientReady`.
 */
export interface CompanionAutoJoin {
  guildId: string
  channelId: string
}

export interface CompanionConfig {
  discordToken: string
  discordClientId: string
  airiUrl: string
  airiToken: string
  textListen: CompanionTextListenOptions
  autoJoin?: CompanionAutoJoin
  stt: {
    baseUrl: string
    apiKey: string
    model: string
  }
}

const RawEnvSchema = v.object({
  DISCORD_COMPANION_TOKEN: v.optional(v.string(), ''),
  DISCORD_COMPANION_CLIENT_ID: v.optional(v.string(), ''),
  AIRI_URL: v.optional(v.string(), 'ws://localhost:6121/ws'),
  AIRI_TOKEN: v.optional(v.string(), ''),
  DISCORD_COMPANION_TEXT_CHANNEL_IDS: v.optional(v.string(), ''),
  DISCORD_COMPANION_TEXT_MENTION_ONLY: v.optional(v.string(), 'true'),
  DISCORD_COMPANION_AUTO_JOIN: v.optional(v.string(), ''),
  OPENAI_STT_API_BASE_URL: v.optional(v.string(), 'https://api.openai.com/v1/'),
  OPENAI_STT_API_KEY: v.optional(v.string(), ''),
  OPENAI_STT_MODEL: v.optional(v.string(), 'whisper-1'),
})

/**
 * Parses a `guildId:channelId` string into a {@link CompanionAutoJoin} descriptor.
 *
 * Before:
 * - "123456789:987654321"
 *
 * After:
 * - { guildId: "123456789", channelId: "987654321" }
 *
 * Returns `undefined` if the input is empty or malformed.
 */
export function parseAutoJoin(raw: string): CompanionAutoJoin | undefined {
  const trimmed = raw.trim()
  if (!trimmed)
    return undefined

  const parts = trimmed.split(':').map(part => part.trim()).filter(Boolean)
  if (parts.length !== 2)
    return undefined

  const [guildId, channelId] = parts
  return { guildId, channelId }
}

/**
 * Parses a comma-separated list of Discord channel IDs into a unique ordered array.
 *
 * Before:
 * - "111,222, 333,111"
 *
 * After:
 * - ["111", "222", "333"]
 */
export function parseChannelIds(raw: string): string[] {
  const ids = raw.split(',').map(id => id.trim()).filter(Boolean)
  return Array.from(new Set(ids))
}

/**
 * Reads and validates companion configuration from `process.env` (with sensible
 * fallbacks).
 *
 * Use when:
 * - Bootstrapping the service at process start-up. Secrets may be empty at this
 *   point — in that case the service will stay idle until the `module:configure`
 *   event arrives from the AIRI host.
 */
export function loadCompanionConfigFromEnv(source: NodeJS.ProcessEnv = env): CompanionConfig {
  const parsed = v.parse(RawEnvSchema, {
    DISCORD_COMPANION_TOKEN: source.DISCORD_COMPANION_TOKEN ?? source.DISCORD_TOKEN,
    DISCORD_COMPANION_CLIENT_ID: source.DISCORD_COMPANION_CLIENT_ID ?? source.DISCORD_BOT_CLIENT_ID,
    AIRI_URL: source.AIRI_URL,
    AIRI_TOKEN: source.AIRI_TOKEN,
    DISCORD_COMPANION_TEXT_CHANNEL_IDS: source.DISCORD_COMPANION_TEXT_CHANNEL_IDS,
    DISCORD_COMPANION_TEXT_MENTION_ONLY: source.DISCORD_COMPANION_TEXT_MENTION_ONLY,
    DISCORD_COMPANION_AUTO_JOIN: source.DISCORD_COMPANION_AUTO_JOIN,
    OPENAI_STT_API_BASE_URL: source.OPENAI_STT_API_BASE_URL,
    OPENAI_STT_API_KEY: source.OPENAI_STT_API_KEY,
    OPENAI_STT_MODEL: source.OPENAI_STT_MODEL,
  })

  return {
    discordToken: parsed.DISCORD_COMPANION_TOKEN,
    discordClientId: parsed.DISCORD_COMPANION_CLIENT_ID,
    airiUrl: parsed.AIRI_URL,
    airiToken: parsed.AIRI_TOKEN || 'abcd',
    textListen: {
      extraChannelIds: parseChannelIds(parsed.DISCORD_COMPANION_TEXT_CHANNEL_IDS),
      mentionOnly: parsed.DISCORD_COMPANION_TEXT_MENTION_ONLY.toLowerCase() !== 'false',
    },
    autoJoin: parseAutoJoin(parsed.DISCORD_COMPANION_AUTO_JOIN),
    stt: {
      baseUrl: parsed.OPENAI_STT_API_BASE_URL,
      apiKey: parsed.OPENAI_STT_API_KEY,
      model: parsed.OPENAI_STT_MODEL,
    },
  }
}

/**
 * Configuration shape accepted through the AIRI `module:configure` event for
 * the companion module (module name: `discord-companion`).
 */
export interface CompanionRemoteConfig {
  enabled?: boolean
  token?: string
  textChannelIds?: string[]
  mentionOnly?: boolean
  autoJoin?: CompanionAutoJoin | null
}

export const CompanionRemoteConfigSchema = v.object({
  enabled: v.optional(v.boolean()),
  token: v.optional(v.string()),
  textChannelIds: v.optional(v.array(v.string())),
  mentionOnly: v.optional(v.boolean()),
  autoJoin: v.optional(
    v.nullable(
      v.object({
        guildId: v.string(),
        channelId: v.string(),
      }),
    ),
  ),
})

/**
 * Type guard for arbitrary `module:configure` payloads.
 */
export function isCompanionRemoteConfig(value: unknown): value is CompanionRemoteConfig {
  const result = v.safeParse(CompanionRemoteConfigSchema, value)
  return result.success
}
