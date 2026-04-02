import type { WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-sdk'
import type { ChatProvider, ChatProviderWithExtraOptions, EmbedProvider, EmbedProviderWithExtraOptions, SpeechProvider, SpeechProviderWithExtraOptions, TranscriptionProvider, TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { SparkNotifyCommandDraft } from '../../../../../tools'
import type { StreamEvent } from '../../../../llm'

import { nanoid } from 'nanoid'

import { createSparkNotifyTools } from '../../../../../tools'
import { getEventSourceKey } from '../../../../../utils'

export type { SparkNotifyCommandDraft, SparkNotifyCommandSchema } from '../../../../../tools'
export { sparkNotifyCommandSchema } from '../../../../../tools'

export interface SparkNotifyResponse {
  reaction?: string
  commands?: SparkNotifyCommandDraft[]
}

export interface SparkNotifyAgentDeps {
  stream: (
    model: string,
    provider: ChatProvider,
    messages: Message[],
    options: {
      tools?: any[]
      supportsTools?: boolean
      waitForTools?: boolean
      onStreamEvent?: (event: StreamEvent) => void | Promise<void>
    },
  ) => Promise<void>
  getActiveProvider: () => string | undefined
  getActiveModel: () => string | undefined
  getProviderInstance: <R extends
  | ChatProvider
  | ChatProviderWithExtraOptions
  | EmbedProvider
  | EmbedProviderWithExtraOptions
  | SpeechProvider
  | SpeechProviderWithExtraOptions
  | TranscriptionProvider
  | TranscriptionProviderWithExtraOptions,
  >(name: string,
  ) => Promise<R>
  onReactionDelta: (eventId: string, text: string) => void
  onReactionEnd: (eventId: string, text: string) => void
  getSystemPrompt: () => string
  getProcessing: () => boolean
  setProcessing: (next: boolean) => void
  getPending: () => Array<WebSocketEventOf<'spark:notify'>>
  setPending: (next: Array<WebSocketEventOf<'spark:notify'>>) => void
}

function getSparkNotifyHandlingAgentInstruction(moduleName: string) {
  return [
    'This is AIRI system, the life pod hosting your consciousness. You don\'t need to respond to me or every spark:notify event directly.',
    `Another module "${moduleName}" triggered spark:notify event for you to checkout.`,
    'You may call the built-in tool "builtIn_sparkCommand" to issue spark:command to sub-agents as needed.',
    'For any of the output that is not a tool call, it will be streamed to user\'s interface and maybe processed with text to speech system ',
    'to be played out loud as your actual reaction to the spark:notify event.',
  ].join('\n')
}

export function setupAgentSparkNotifyHandler(deps: SparkNotifyAgentDeps) {
  async function runNotifyAgent(event: WebSocketEventOf<'spark:notify'>) {
    const activeProvider = deps.getActiveProvider()
    const activeModel = deps.getActiveModel()
    if (!activeProvider || !activeModel) {
      console.warn('Spark notify ignored: missing active provider or model')
      return undefined
    }

    const chatProvider = await deps.getProviderInstance<ChatProvider>(activeProvider)
    const commandDrafts: SparkNotifyCommandDraft[] = []

    let noResponse = false

    const { tools } = await createSparkNotifyTools({
      onNoResponse: () => {
        noResponse = true
      },
      onCommands: commands => commandDrafts.push(...commands),
    })

    const systemMessage: Message = {
      role: 'system',
      content: [
        deps.getSystemPrompt(),
        getSparkNotifyHandlingAgentInstruction(getEventSourceKey(event)),
      ].filter(Boolean).join('\n\n'),
    }

    const userMessage: Message = {
      role: 'user',
      content: JSON.stringify({
        notify: event.data,
        source: event.source,
      }, null, 2),
    }

    let fullText = ''

    await deps.stream(activeModel, chatProvider, [systemMessage, userMessage], {
      tools,
      supportsTools: true,
      waitForTools: true,
      onStreamEvent: async (streamEvent: StreamEvent) => {
        if (streamEvent.type === 'text-delta') {
          if (noResponse)
            return

          deps.onReactionDelta(event.data.id, streamEvent.text)

          fullText += streamEvent.text
        }
        if (streamEvent.type === 'finish') {
          if (noResponse) {
            deps.onReactionEnd(event.data.id, '')
            return
          }

          deps.onReactionEnd(event.data.id, fullText)
        }
        if (streamEvent.type === 'error') {
          deps.onReactionEnd(event.data.id, fullText)
          throw streamEvent.error ?? new Error('Spark notify stream error')
        }
      },
    })

    return {
      reaction: fullText.trim(),
      commands: commandDrafts,
    } satisfies SparkNotifyResponse
  }

  async function handle(event: WebSocketEventOf<'spark:notify'>) {
    if (event.data.urgency !== 'immediate' && deps.getPending().length > 0) {
      deps.setPending([...deps.getPending(), event])
      return undefined
    }
    if (deps.getProcessing()) {
      deps.setPending([...deps.getPending(), event])
      return undefined
    }

    deps.setProcessing(true)

    try {
      const response = await runNotifyAgent(event)
      if (!response)
        return undefined

      const commands = (response.commands ?? [])
        .map(command => ({
          id: nanoid(),
          eventId: nanoid(),
          parentEventId: event.data.id,
          commandId: nanoid(),
          interrupt: (command.interrupt === true ? 'force' : command.interrupt) ?? false,
          priority: command.priority ?? 'normal',
          intent: command.intent ?? 'action',
          ack: command.ack,
          guidance: command.guidance,
          contexts: command.contexts,
          destinations: command.destinations ?? [],
        } satisfies WebSocketEvents['spark:command']))
        .filter(command => command.destinations.length > 0)

      return {
        commands,
      }
    }
    finally {
      deps.setProcessing(false)
    }
  }

  return {
    handle,
  }
}
