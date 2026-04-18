import type { Discord, InputEventData } from '@proj-airi/server-shared/types'

import { useLogg } from '@guiiai/logg'
import { Client as ServerChannel } from '@proj-airi/server-sdk'
import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'

import {
  buildMessagePrefix,
  computeSessionId,
  normalizeDiscordMetadata,
} from '../utils/discord-context'

const log = useLogg('AIRI:Channel').useGlobalConfig()

export interface AiriChannelOptions {
  /**
   * WebSocket URL of the AIRI server channel, e.g. `ws://localhost:6121/ws`.
   */
  url: string
  /**
   * Authentication token for the channel.
   */
  token: string
}

/**
 * Discriminator used to tell apart `input:text` (user typed a message) from
 * `input:text:voice` (STT transcription result).
 */
export type CompanionInputKind = 'text' | 'voice'

export interface CompanionChatInput {
  kind: CompanionInputKind
  text: string
  /**
   * Original raw text (before stripping mentions etc.), only meaningful for
   * `text` kind.
   */
  textRaw?: string
  discord: Discord
}

export interface CompanionOutputMessage {
  channelId?: string
  content: string
}

export type CompanionOutputListener = (message: CompanionOutputMessage) => void | Promise<void>
export type CompanionConfigureListener = (config: unknown) => void | Promise<void>

/**
 * Thin wrapper around `@proj-airi/server-sdk`'s `Client` for the Discord
 * companion module.
 *
 * Use when:
 * - Announcing the `discord-companion` module to the AIRI server and forwarding
 *   chat/voice inputs, while receiving AI responses and remote configuration.
 *
 * Expects:
 * - A reachable AIRI server (idempotent reconnects handled by the SDK).
 *
 * Call stack:
 *
 * discord-companion entry (../index)
 * -> {@link createAiriChannel}
 * -> ServerChannel (@proj-airi/server-sdk)
 */
export interface AiriChannel {
  close: () => void
  onConfigure: (listener: CompanionConfigureListener) => () => void
  onOutputMessage: (listener: CompanionOutputListener) => () => void
  sendChatInput: (input: CompanionChatInput) => void
}

/**
 * Module name announced to the AIRI host. Using a dedicated name keeps this
 * service isolated from the legacy `services/discord-bot` module registration.
 */
export const MODULE_NAME = 'discord-companion'

export function createAiriChannel(options: AiriChannelOptions): AiriChannel {
  const client = new ServerChannel({
    name: MODULE_NAME,
    possibleEvents: [
      'input:text',
      'input:text:voice',
      'module:configure',
      'output:gen-ai:chat:message',
    ],
    token: options.token,
    url: options.url,
  })

  const configureListeners = new Set<CompanionConfigureListener>()
  const outputListeners = new Set<CompanionOutputListener>()

  client.onEvent('module:configure', async (event) => {
    const config = (event.data as { config?: unknown }).config
    log.log('Received module:configure event')
    await Promise.all(
      Array.from(configureListeners).map(async (listener) => {
        try {
          await listener(config)
        }
        catch (error) {
          log.withError(error).error('configure listener threw')
        }
      }),
    )
  })

  client.onEvent('output:gen-ai:chat:message', async (event) => {
    try {
      const data = event.data as {
        message?: { content?: string }
      } & {
        'gen-ai:chat'?: { input?: { data?: { discord?: { channelId?: string } } } }
      }

      const content = data.message?.content
      const channelId = data['gen-ai:chat']?.input?.data?.discord?.channelId

      if (!content) {
        return
      }

      await Promise.all(
        Array.from(outputListeners).map(async (listener) => {
          try {
            await listener({ channelId, content })
          }
          catch (error) {
            log.withError(error).error('output listener threw')
          }
        }),
      )
    }
    catch (error) {
      log.withError(error).error('Failed to process output:gen-ai:chat:message')
    }
  })

  const sendChatInput = (input: CompanionChatInput) => {
    const normalized = normalizeDiscordMetadata(input.discord)
    const sessionId = computeSessionId(normalized)
    const messagePrefix = buildMessagePrefix(normalized)

    const contextNotice = normalized
      ? `The input is coming from Discord channel ${normalized.channelId ?? 'unknown'} (Guild: ${normalized.guildId ?? 'unknown'}).`
      : undefined

    const overrides = {
      sessionId,
      messagePrefix,
    }

    const contextUpdates = contextNotice
      ? [{
          strategy: ContextUpdateStrategy.AppendSelf,
          text: contextNotice,
          content: contextNotice,
          metadata: { discord: normalized },
        }]
      : undefined

    if (input.kind === 'voice') {
      const payload: InputEventData = {
        transcription: input.text,
        overrides,
        contextUpdates,
        discord: normalized,
      }

      client.send({
        type: 'input:text:voice',
        data: payload,
      })

      client.send({
        type: 'input:text',
        data: {
          text: input.text,
          overrides,
          contextUpdates,
          discord: normalized,
        },
      })

      return
    }

    client.send({
      type: 'input:text',
      data: {
        text: input.text,
        textRaw: input.textRaw,
        overrides,
        contextUpdates,
        discord: normalized,
      },
    })
  }

  return {
    close: () => client.close(),
    onConfigure: (listener) => {
      configureListeners.add(listener)
      return () => {
        configureListeners.delete(listener)
      }
    },
    onOutputMessage: (listener) => {
      outputListeners.add(listener)
      return () => {
        outputListeners.delete(listener)
      }
    },
    sendChatInput,
  }
}
