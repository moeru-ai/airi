import type { Client as DiscordClient } from 'discord.js'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { splitForDiscord } from '../utils/text'

const log = useLogg('Discord:OutputBridge').useGlobalConfig()

export interface OutputBridgeOptions {
  client: DiscordClient
}

export interface OutputBridgeHandle {
  send: (channelId: string | undefined, content: string) => Promise<void>
}

/**
 * Responsible for sending AIRI-generated responses back to Discord, splitting
 * long messages across multiple sends to stay under the 2000-character limit.
 */
export function createOutputBridge(options: OutputBridgeOptions): OutputBridgeHandle {
  const send = async (channelId: string | undefined, content: string) => {
    if (!channelId) {
      log.warn('Dropping AIRI output: no Discord channelId on event metadata')
      return
    }
    if (!content) {
      return
    }

    try {
      const channel = await options.client.channels.fetch(channelId)
      if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
        log.withField('channelId', channelId).warn('Target channel is not text-based, skipping send')
        return
      }

      const chunks = splitForDiscord(content)
      for (const chunk of chunks) {
        await channel.send(chunk)
      }
    }
    catch (error) {
      log
        .withError(error)
        .withField('message', errorMessageFrom(error) ?? 'unknown error')
        .withField('channelId', channelId)
        .error('Failed to send AIRI response to Discord')
    }
  }

  return { send }
}
