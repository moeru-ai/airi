import type { Message, OmitPartialGroupDMChannel } from 'discord.js'

import type { AiriChannel } from '../airi/channel'

import { useLogg } from '@guiiai/logg'

import { stripDiscordMentions } from '../utils/text'

const log = useLogg('Discord:TextBridge').useGlobalConfig()

export interface TextBridgeOptions {
  airi: AiriChannel
  /**
   * Returns the attached text channel id of a guild's active voice channel, if any.
   */
  getAttachedTextChannelId: (guildId: string) => string | undefined
  /**
   * Extra text channel IDs to always listen on (e.g. via remote configuration).
   */
  getExtraChannelIds: () => readonly string[]
  /**
   * When true, only messages that mention the bot (or DMs) are forwarded; when
   * false, every non-bot message in a listened channel is forwarded.
   */
  isMentionOnly: () => boolean
  /**
   * Bot's own user id, used to detect mentions. Returning undefined disables the
   * mention check (all messages in listened channels are forwarded instead).
   */
  getSelfUserId: () => string | undefined
}

export interface TextBridgeHandle {
  /**
   * Called with an incoming non-bot message; returns true if the message was
   * forwarded to AIRI.
   */
  handleMessage: (
    message: OmitPartialGroupDMChannel<Message>,
  ) => boolean
}

/**
 * Returns a text-message router that decides which Discord messages should be
 * relayed to the AIRI pipeline as `input:text` events.
 *
 * Forwarding rules (evaluated in order):
 * 1. DMs (no guild) → always forward.
 * 2. Message channel is a voice-channel-attached chat → forward.
 * 3. Message channel id is in the `extraChannelIds` allow-list → forward.
 * 4. `mentionOnly === false` and the message came from a listened channel → forward.
 *
 * When forwarding, mentions of the bot are stripped from the text payload.
 */
export function createTextBridge(options: TextBridgeOptions): TextBridgeHandle {
  const handleMessage = (
    message: OmitPartialGroupDMChannel<Message>,
  ): boolean => {
    if (message.author.bot)
      return false

    const rawContent = message.content
    if (!rawContent)
      return false

    const isDM = !message.guild
    const attachedChannelId = message.guildId
      ? options.getAttachedTextChannelId(message.guildId)
      : undefined

    const extraIds = options.getExtraChannelIds()
    const isVoiceAttached = attachedChannelId === message.channelId
    const isInExtra = extraIds.includes(message.channelId)
    const isInListenedChannel = isDM || isVoiceAttached || isInExtra

    if (!isInListenedChannel) {
      return false
    }

    const selfUserId = options.getSelfUserId()
    const isMentioned = selfUserId
      ? message.mentions.users.has(selfUserId)
      : false

    const mentionOnly = options.isMentionOnly()
    if (mentionOnly && !isDM && !isMentioned) {
      return false
    }

    const cleanedText = isMentioned
      ? stripDiscordMentions(rawContent)
      : rawContent.trim()

    if (!cleanedText)
      return false

    log
      .withField('author', message.author.tag)
      .withField('channelId', message.channelId)
      .withField('isDM', isDM)
      .withField('mentioned', isMentioned)
      .log('Forwarding Discord text message to AIRI')

    options.airi.sendChatInput({
      kind: 'text',
      text: cleanedText,
      textRaw: rawContent,
      discord: {
        channelId: message.channelId,
        guildId: message.guildId ?? undefined,
        guildName: message.guild?.name ?? undefined,
        guildMember: {
          id: message.author.id,
          displayName: message.member?.displayName ?? message.author.username,
          nickname: message.member?.nickname ?? message.author.username,
        },
      },
    })

    return true
  }

  return { handleMessage }
}
